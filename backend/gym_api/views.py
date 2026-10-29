from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core import signing
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response

from .models import (
    AttendanceRecord,
    GymSettings,
    Member,
    MembershipApprovalAudit,
    Membership,
    MembershipPlan,
    MembershipRenewalRequest,
    Payment,
    UserProfile,
)
from .serializers import (
    AttendanceSerializer,
    GymSettingsSerializer,
    MemberSerializer,
    MembershipPlanSerializer,
    MembershipSerializer,
    PaymentSerializer,
)

User = get_user_model()
QR_TOKEN_SALT = "gym-api-member-qr-v1"
QR_TOKEN_MAX_AGE_SECONDS = 180


def profile_for(user):
    try:
        return user.gym_profile
    except UserProfile.DoesNotExist:
        if not user.is_superuser:
            return None
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={"role": UserProfile.Role.ADMINISTRATOR},
        )
        return profile


def portal_member_for(user):
    try:
        return user.portal_member
    except Member.DoesNotExist:
        return None


def user_payload(user):
    member = portal_member_for(user)
    if member is not None:
        settings = GymSettings.objects.filter(pk=1).first()
        return {
            "id": user.pk,
            "username": user.get_username(),
            "email": user.email,
            "firstName": user.first_name,
            "lastName": user.last_name,
            "role": "member",
            "memberId": member.pk,
            "gymName": settings.gym_name if settings else "",
            "logoText": settings.logo_text if settings else "",
            "isActive": user.is_active,
        }
    profile = profile_for(user)
    settings = GymSettings.objects.filter(pk=1).first()
    return {
        "id": user.pk,
        "username": user.get_username(),
        "email": user.email,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "role": profile.role if profile else "unassigned",
        "gymName": settings.gym_name if settings else "",
        "logoText": settings.logo_text if settings else "",
        "isActive": user.is_active,
    }


class IsAdministrator(BasePermission):
    def has_permission(self, request, view):
        profile = profile_for(request.user) if request.user.is_authenticated else None
        return (
            request.user.is_authenticated
            and portal_member_for(request.user) is None
            and profile is not None
            and profile.role == UserProfile.Role.ADMINISTRATOR
        )


class IsStaffUser(BasePermission):
    def has_permission(self, request, view):
        profile = profile_for(request.user) if request.user.is_authenticated else None
        return (
            request.user.is_authenticated
            and portal_member_for(request.user) is None
            and profile is not None
            and profile.role in UserProfile.Role.values
        )


def snapshot_response():
    settings, _ = GymSettings.objects.get_or_create(id=1)
    return {
        "members": MemberSerializer(Member.objects.all().order_by("joined_at", "id"), many=True).data,
        "plans": MembershipPlanSerializer(MembershipPlan.objects.all().order_by("name"), many=True).data,
        "memberships": MembershipSerializer(Membership.objects.all().order_by("-start_date", "id"), many=True).data,
        "payments": PaymentSerializer(Payment.objects.select_related("member").all().order_by("-date", "id"), many=True).data,
        "attendance": AttendanceSerializer(AttendanceRecord.objects.select_related("member").all().order_by("-checked_in_at", "id"), many=True).data,
        "settings": GymSettingsSerializer(settings).data,
    }


def upsert_collection(payload, key, model, serializer_class):
    records = payload.get(key)
    if not isinstance(records, list):
        raise serializers.ValidationError({key: "A list is required."})
    for record in records:
        if not isinstance(record, dict) or not record.get("id"):
            raise serializers.ValidationError({key: "Every record must have an id."})
        instance = model.objects.filter(pk=record["id"]).first()
        serializer = serializer_class(instance=instance, data=record)
        serializer.is_valid(raise_exception=True)
        serializer.save()


def validate_membership_balances(payload):
    memberships = payload.get("memberships")
    payments = payload.get("payments")
    if not isinstance(memberships, list) or not isinstance(payments, list):
        raise serializers.ValidationError(
            {"memberships": "Memberships and payments must both be lists."}
        )

    existing_memberships = Membership.objects.in_bulk()
    existing_payment_ids = set(Payment.objects.values_list("id", flat=True))
    requested_membership_ids = {
        record.get("id")
        for record in memberships
        if isinstance(record, dict) and record.get("id")
    }
    payment_deltas = defaultdict(Decimal)
    for payment in payments:
        if not isinstance(payment, dict) or not payment.get("id"):
            continue
        if payment["id"] in existing_payment_ids:
            continue
        membership_id = payment.get("membershipId")
        if membership_id is None:
            continue
        if membership_id not in requested_membership_ids:
            raise serializers.ValidationError(
                {"payments": "Include the membership associated with each new payment."}
            )
        if payment.get("status") != Payment.Status.CLEARED:
            continue
        try:
            payment_deltas[membership_id] += Decimal(str(payment.get("amount", "0")))
        except (InvalidOperation, TypeError):
            raise serializers.ValidationError({"payments": "Payment amounts must be valid numbers."})

    for record in memberships:
        if not isinstance(record, dict) or not record.get("id"):
            continue
        membership_id = record["id"]
        previous = existing_memberships.get(membership_id)
        if previous:
            base_total = previous.amount_paid + previous.amount_due
            previous_paid = previous.amount_paid
        else:
            try:
                plan = MembershipPlan.objects.get(pk=record.get("planId"))
                member = Member.objects.get(pk=record.get("memberId"))
            except (MembershipPlan.DoesNotExist, Member.DoesNotExist, TypeError, ValueError):
                raise serializers.ValidationError(
                    {"memberships": "Each membership must reference an existing member and plan."}
                )
            if member.status != Member.Status.ACTIVE or member.is_archived or plan.status != Member.Status.ACTIVE:
                raise serializers.ValidationError(
                    {"memberships": "New memberships require an active, unarchived member and active plan."}
                )
            try:
                start_date = date.fromisoformat(record["startDate"])
                end_date = date.fromisoformat(record["endDate"])
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError({"memberships": "Membership dates are invalid."})
            if (end_date - start_date).days + 1 != plan.duration_days:
                raise serializers.ValidationError(
                    {"memberships": "The membership duration must match its plan."}
                )
            base_total = plan.price
            previous_paid = Decimal("0")

        paid = min(base_total, max(Decimal("0"), previous_paid + payment_deltas[membership_id]))
        due = max(Decimal("0"), base_total - paid)
        payment_status = (
            Membership.PaymentStatus.PAID
            if due == 0
            else Membership.PaymentStatus.PARTIAL
            if paid > 0
            else Membership.PaymentStatus.UNPAID
        )
        try:
            submitted_paid = Decimal(str(record["amountPaid"]))
            submitted_due = Decimal(str(record["amountDue"]))
        except (KeyError, InvalidOperation, TypeError):
            raise serializers.ValidationError({"memberships": "Membership balances are invalid."})
        if (
            submitted_paid != paid
            or submitted_due != due
            or record.get("paymentStatus") != payment_status
        ):
            raise serializers.ValidationError(
                {"memberships": "Membership balances must match the payment records."}
            )


@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({"csrfToken": get_token(request)})


@api_view(["GET"])
@permission_classes([AllowAny])
def session_user(request):
    if not request.user.is_authenticated:
        return Response({"authenticated": False})
    return Response(user_payload(request.user))


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_protect
def session_login(request):
    username = request.data.get("username")
    password = request.data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return Response(
            {"detail": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "The username or password is incorrect."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if not (portal_member_for(user) or profile_for(user)):
        return Response(
            {"detail": "The username or password is incorrect."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    login(request, user)
    return Response(user_payload(user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def session_logout(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated, IsStaffUser])
def snapshot(request):
    if request.method == "GET":
        return Response(snapshot_response())
    if not isinstance(request.data, dict):
        return Response({"detail": "A JSON object is required."}, status=status.HTTP_400_BAD_REQUEST)

    administrator = profile_for(request.user).role == UserProfile.Role.ADMINISTRATOR
    try:
        with transaction.atomic():
            if not administrator:
                plans = MembershipPlanSerializer(
                    MembershipPlan.objects.all().order_by("name"), many=True,
                ).data
                settings = GymSettingsSerializer(
                    GymSettings.objects.get_or_create(id=1)[0],
                ).data
                if request.data.get("plans") != plans:
                    raise serializers.ValidationError(
                        {"plans": "Only administrators can change membership plans."}
                    )
                if request.data.get("settings") != settings:
                    raise serializers.ValidationError(
                        {"settings": "Only administrators can change gym settings."}
                    )

            upsert_collection(request.data, "members", Member, MemberSerializer)
            if administrator:
                upsert_collection(request.data, "plans", MembershipPlan, MembershipPlanSerializer)
            validate_membership_balances(request.data)
            upsert_collection(request.data, "memberships", Membership, MembershipSerializer)
            payment_records = request.data.get("payments")
            if isinstance(payment_records, list):
                payment_records = sorted(
                    payment_records,
                    key=lambda payment: bool(
                        isinstance(payment, dict) and payment.get("correctionOf")
                    ),
                )
                request.data["payments"] = payment_records
            upsert_collection(request.data, "payments", Payment, PaymentSerializer)
            upsert_collection(request.data, "attendance", AttendanceRecord, AttendanceSerializer)
            settings_data = request.data.get("settings")
            if not isinstance(settings_data, dict):
                raise serializers.ValidationError({"settings": "An object is required."})
            if administrator:
                settings, _ = GymSettings.objects.get_or_create(id=1)
                settings_serializer = GymSettingsSerializer(instance=settings, data=settings_data)
                settings_serializer.is_valid(raise_exception=True)
                settings_serializer.save()
    except serializers.ValidationError as exc:
        return Response({"detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST)

    return Response(snapshot_response())


@api_view(["GET"])
@permission_classes([AllowAny])
def public_branding(request):
        settings = GymSettings.objects.filter(pk=1).first()
        return Response({
            "gymName": settings.gym_name if settings else "",
            "logoText": settings.logo_text if settings else "",
        })


def portal_member_or_404(request):
        member = portal_member_for(request.user)
        if member is None:
            return None
        return member


def membership_allows_access(membership, on_date):
        return (
            not membership.is_archived
            and membership.start_date <= on_date <= membership.end_date
            and (
                membership.payment_status in (
                    Membership.PaymentStatus.PAID,
                    Membership.PaymentStatus.PARTIAL,
                )
                or (
                    membership.payment_status == Membership.PaymentStatus.UNPAID
                    and membership.unpaid_approved_by_id is not None
                    and membership.unpaid_approved_at is not None
                )
            )
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def member_portal_me(request):
        member = portal_member_or_404(request)
        if member is None:
            return Response({"detail": "Member portal account not found."}, status=status.HTTP_404_NOT_FOUND)
        memberships = Membership.objects.filter(member=member).select_related("plan").order_by("-start_date", "id")
        payments = Payment.objects.filter(member=member).order_by("-date", "id")
        attendance = AttendanceRecord.objects.filter(member=member).order_by("-checked_in_at", "id")
        return Response({
            "member": MemberSerializer(member).data,
            "memberships": MembershipSerializer(memberships, many=True).data,
            "payments": PaymentSerializer(payments, many=True).data,
            "attendance": AttendanceSerializer(attendance, many=True).data,
        })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def member_portal_qr(request):
        member = portal_member_or_404(request)
        if member is None:
            return Response({"detail": "Member portal account not found."}, status=status.HTTP_404_NOT_FOUND)
        if not request.user.is_active or member.status != Member.Status.ACTIVE or member.is_archived:
            return Response({"detail": "This member account is inactive."}, status=status.HTTP_403_FORBIDDEN)
        if not any(
            membership_allows_access(item, timezone.localdate())
            for item in Membership.objects.filter(member=member)
        ):
            return Response({"detail": "A valid membership is required."}, status=status.HTTP_403_FORBIDDEN)
        expires_at = timezone.now() + timedelta(seconds=QR_TOKEN_MAX_AGE_SECONDS)
        token = signing.dumps({"memberId": member.pk}, salt=QR_TOKEN_SALT)
        return Response({"token": token, "expiresAt": expires_at.isoformat()})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def member_portal_check_in(request):
        member = portal_member_or_404(request)
        if member is None:
            return Response({"detail": "Member portal account not found."}, status=status.HTTP_404_NOT_FOUND)
        token = request.data.get("token")
        if not isinstance(token, str) or not token:
            return Response({"token": "A signed QR token is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            payload = signing.loads(token, salt=QR_TOKEN_SALT, max_age=QR_TOKEN_MAX_AGE_SECONDS)
        except signing.SignatureExpired:
            return Response({"token": "The QR token has expired."}, status=status.HTTP_400_BAD_REQUEST)
        except signing.BadSignature:
            return Response({"token": "The QR token is invalid."}, status=status.HTTP_400_BAD_REQUEST)
        if payload != {"memberId": member.pk}:
            return Response({"token": "The QR token does not match this member."}, status=status.HTTP_403_FORBIDDEN)
        return record_qr_check_in(request, member)


def record_qr_check_in(request, member):
        now = timezone.now()
        check_date = timezone.localtime(now).date()
        with transaction.atomic():
            member = Member.objects.select_for_update().get(pk=member.pk)
            if not request.user.is_active or member.status != Member.Status.ACTIVE or member.is_archived:
                return Response({"detail": "This member is inactive."}, status=status.HTTP_403_FORBIDDEN)
            if not any(
                membership_allows_access(item, check_date)
                for item in Membership.objects.filter(member=member)
            ):
                return Response({"detail": "A valid membership is required."}, status=status.HTTP_403_FORBIDDEN)
            settings = GymSettings.objects.filter(pk=1).first()
            interval = settings.duplicate_check_in_minutes if settings else 30
            if interval and AttendanceRecord.objects.filter(
                member=member,
                checked_in_at__gte=now - timedelta(minutes=interval),
            ).exists():
                return Response(
                    {"detail": "A check-in was already recorded within the duplicate interval."},
                    status=status.HTTP_409_CONFLICT,
                )
            record = AttendanceRecord.objects.create(
                id=uuid4().hex,
                member=member,
                checked_in_at=now,
                status=AttendanceRecord.Status.CHECKED_IN,
            )
        return Response(AttendanceSerializer(record).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsStaffUser])
def staff_qr_check_in(request):
        token = request.data.get("token") if isinstance(request.data, dict) else None
        if not isinstance(token, str) or not token:
            return Response({"token": "A signed QR token is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            payload = signing.loads(token, salt=QR_TOKEN_SALT, max_age=QR_TOKEN_MAX_AGE_SECONDS)
        except signing.SignatureExpired:
            return Response({"token": "The QR token has expired."}, status=status.HTTP_400_BAD_REQUEST)
        except signing.BadSignature:
            return Response({"token": "The QR token is invalid."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(payload, dict) or set(payload) != {"memberId"}:
            return Response({"token": "The QR token payload is invalid."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            member = Member.objects.get(pk=payload["memberId"])
        except (Member.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Member not found."}, status=status.HTTP_404_NOT_FOUND)
        return record_qr_check_in(request, member)


@api_view(["POST", "PUT", "DELETE"])
@permission_classes([IsAuthenticated, IsAdministrator])
def member_portal_accounts(request, member_id=None):
        if request.method == "DELETE":
            try:
                member = Member.objects.select_related("portal_user").get(pk=member_id)
            except (Member.DoesNotExist, TypeError, ValueError):
                return Response({"memberId": "Member not found."}, status=status.HTTP_404_NOT_FOUND)
            user = member.portal_user
            if user is None:
                return Response({"detail": "This member has no portal account."}, status=status.HTTP_404_NOT_FOUND)
            if UserProfile.objects.filter(user=user).exists():
                return Response({"detail": "A staff account cannot be deprovisioned as a member portal account."}, status=status.HTTP_400_BAD_REQUEST)
            member.portal_user = None
            member.save(update_fields=["portal_user"])
            user.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        if request.method == "PUT":
            return member_portal_account_status(request)
        data = request.data
        if not isinstance(data, dict):
            return Response({"detail": "A JSON object is required."}, status=status.HTTP_400_BAD_REQUEST)
        member_id = data.get("memberId")
        try:
            member = Member.objects.select_related("portal_user").get(pk=member_id)
        except (Member.DoesNotExist, TypeError, ValueError):
            return Response({"memberId": "Member not found."}, status=status.HTTP_404_NOT_FOUND)
        username = data.get("username")
        password = data.get("password")
        if not isinstance(username, str) or not username.strip():
            return Response({"username": "A username is required."}, status=status.HTTP_400_BAD_REQUEST)
        username = username.strip()
        if len(username) > User._meta.get_field("username").max_length:
            return Response({"username": "Username is too long."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(password, str):
            return Response({"password": "A password is required."}, status=status.HTTP_400_BAD_REQUEST)
        existing_user = member.portal_user
        username_matches = User.objects.filter(username__iexact=username)
        if existing_user:
            username_matches = username_matches.exclude(pk=existing_user.pk)
        if username_matches.exists():
            return Response({"username": "This username is already in use."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password, user=existing_user)
        except DjangoValidationError as exc:
            return Response({"password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        if existing_user and UserProfile.objects.filter(user=existing_user).exists():
            return Response({"detail": "A staff account cannot be linked as a member portal account."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = existing_user or User(username=username, email=member.email)
            user.username = username
            user.email = member.email
            user.set_password(password)
            user.is_active = True
            user.save()
            if member.portal_user_id != user.pk:
                member.portal_user = user
                member.save(update_fields=["portal_user"])
        return Response(
            {"memberId": member.pk, "username": user.username, "isActive": user.is_active},
            status=status.HTTP_200_OK if existing_user else status.HTTP_201_CREATED,
        )


def member_portal_account_status(request):
        member_id = request.data.get("memberId") if isinstance(request.data, dict) else None
        is_active = request.data.get("isActive") if isinstance(request.data, dict) else None
        if not isinstance(is_active, bool):
            return Response({"isActive": "A boolean active status is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            member = Member.objects.select_related("portal_user").get(pk=member_id)
        except (Member.DoesNotExist, TypeError, ValueError):
            return Response({"memberId": "Member not found."}, status=status.HTTP_404_NOT_FOUND)
        if member.portal_user_id is None:
            return Response({"detail": "This member has no portal account."}, status=status.HTTP_404_NOT_FOUND)
        member.portal_user.is_active = is_active
        member.portal_user.save(update_fields=["is_active"])
        return Response({"memberId": member.pk, "username": member.portal_user.username, "isActive": is_active})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrator])
def approve_unpaid_membership(request, membership_id):
        try:
            membership = Membership.objects.get(pk=membership_id)
        except Membership.DoesNotExist:
            return Response({"detail": "Membership not found."}, status=status.HTTP_404_NOT_FOUND)
        if membership.payment_status != Membership.PaymentStatus.UNPAID:
            return Response({"detail": "Only unpaid memberships require explicit approval."}, status=status.HTTP_400_BAD_REQUEST)
        approved = request.data.get("approved") if isinstance(request.data, dict) else None
        if not isinstance(approved, bool):
            return Response({"approved": "A boolean approval state is required."}, status=status.HTTP_400_BAD_REQUEST)
        if approved and (membership.unpaid_approved_at is None or membership.unpaid_approved_by_id is None):
            membership.unpaid_approved_by = request.user
            membership.unpaid_approved_at = timezone.now()
            membership.save(update_fields=["unpaid_approved_by", "unpaid_approved_at"])
            MembershipApprovalAudit.objects.create(
                membership=membership,
                action=MembershipApprovalAudit.Action.APPROVED,
                changed_by=request.user,
            )
        elif not approved and membership.unpaid_approved_at is not None:
            membership.unpaid_approved_by = None
            membership.unpaid_approved_at = None
            membership.save(update_fields=["unpaid_approved_by", "unpaid_approved_at"])
            MembershipApprovalAudit.objects.create(
                membership=membership,
                action=MembershipApprovalAudit.Action.REVOKED,
                changed_by=request.user,
            )
        return Response({"membership": MembershipSerializer(membership).data})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsStaffUser])
def renew_membership(request, membership_id):
        data = request.data
        if not isinstance(data, dict):
            return Response({"detail": "A JSON object is required."}, status=status.HTTP_400_BAD_REQUEST)
        key = data.get("requestId")
        if not isinstance(key, str) or not key.strip() or len(key) > 120:
            return Response({"requestId": "A unique request ID is required."}, status=status.HTTP_400_BAD_REQUEST)
        key = key.strip()
        try:
            source_membership = Membership.objects.select_related("member", "plan").get(pk=membership_id)
        except Membership.DoesNotExist:
            return Response({"detail": "Membership not found."}, status=status.HTTP_404_NOT_FOUND)
        member_id, plan_id = source_membership.member_id, source_membership.plan_id
        previous_request = MembershipRenewalRequest.objects.select_related("membership").filter(idempotency_key=key).first()
        if previous_request:
            if previous_request.membership.member_id != member_id or previous_request.membership.plan_id != plan_id:
                return Response({"detail": "The idempotency key was already used for a different renewal."}, status=status.HTTP_409_CONFLICT)
            return Response({"membership": MembershipSerializer(previous_request.membership).data})
        try:
            with transaction.atomic():
                member = Member.objects.select_for_update().get(pk=member_id)
                plan = MembershipPlan.objects.get(pk=plan_id)
                if member.status != Member.Status.ACTIVE or member.is_archived:
                    return Response({"memberId": "An active, unarchived member is required."}, status=status.HTTP_400_BAD_REQUEST)
                if plan.status != Member.Status.ACTIVE:
                    return Response({"planId": "An active membership plan is required."}, status=status.HTTP_400_BAD_REQUEST)
                previous_request = MembershipRenewalRequest.objects.select_related("membership").filter(idempotency_key=key).first()
                if previous_request:
                    if previous_request.membership.member_id != member.pk or previous_request.membership.plan_id != plan.pk:
                        return Response({"detail": "The idempotency key was already used for a different renewal."}, status=status.HTTP_409_CONFLICT)
                    return Response({"membership": MembershipSerializer(previous_request.membership).data})
                latest = Membership.objects.filter(member=member, is_archived=False).order_by("-end_date").first()
                start_date = max(timezone.localdate(), latest.end_date + timedelta(days=1)) if latest else timezone.localdate()
                end_date = start_date + timedelta(days=plan.duration_days - 1)
                membership = Membership.objects.create(
                    id=uuid4().hex,
                    member=member,
                    plan=plan,
                    start_date=start_date,
                    end_date=end_date,
                    status=Membership.Status.ACTIVE if start_date <= timezone.localdate() <= end_date else Membership.Status.PENDING,
                    payment_status=Membership.PaymentStatus.UNPAID,
                    amount_paid=Decimal("0"),
                    amount_due=plan.price,
                )
                MembershipRenewalRequest.objects.create(idempotency_key=key, membership=membership)
        except (Member.DoesNotExist, MembershipPlan.DoesNotExist):
            return Response({"detail": "Member or membership plan not found."}, status=status.HTTP_404_NOT_FOUND)
        except IntegrityError:
            previous_request = MembershipRenewalRequest.objects.select_related("membership").filter(idempotency_key=key).first()
            if previous_request and previous_request.membership.member_id == member_id and previous_request.membership.plan_id == plan_id:
                return Response({"membership": MembershipSerializer(previous_request.membership).data})
            return Response({"detail": "The idempotency key was already used."}, status=status.HTTP_409_CONFLICT)
        return Response({"membership": MembershipSerializer(membership).data}, status=status.HTTP_201_CREATED)

@api_view(["GET", "POST", "PUT"])
@permission_classes([IsAuthenticated, IsAdministrator])
def staff(request):
    if request.method == "GET":
        return Response([
            user_payload(user)
            for user in User.objects.filter(
                gym_profile__isnull=False,
            ).select_related("gym_profile").order_by("username")
        ])

    if request.method == "POST":
        data = request.data
        if not isinstance(data, dict):
            return Response({"detail": "A JSON object is required."}, status=status.HTTP_400_BAD_REQUEST)
        username = data.get("username")
        password = data.get("password")
        role = data.get("role")
        if not isinstance(username, str) or not username.strip():
            return Response({"username": "A username is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(password, str):
            return Response({"password": "A password is required."}, status=status.HTTP_400_BAD_REQUEST)
        if role not in UserProfile.Role.values:
            return Response({"role": "Choose a valid staff role."}, status=status.HTTP_400_BAD_REQUEST)
        optional_fields = ("email", "firstName", "lastName")
        if any(not isinstance(data.get(field, ""), str) for field in optional_fields):
            return Response(
                {"detail": "Email and name fields must be strings."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if User.objects.filter(username__iexact=username.strip()).exists():
            return Response({"username": "This username is already in use."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password)
        except DjangoValidationError as exc:
            return Response({"password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            user = User.objects.create_user(
                username=username.strip(),
                email=data.get("email", ""),
                first_name=data.get("firstName", ""),
                last_name=data.get("lastName", ""),
                password=password,
            )
            UserProfile.objects.create(user=user, role=role)
        return Response(user_payload(user), status=status.HTTP_201_CREATED)

    user_id = request.data.get("id")
    try:
        user = User.objects.select_related("gym_profile").get(pk=user_id)
    except (User.DoesNotExist, TypeError, ValueError):
        return Response({"detail": "Staff account not found."}, status=status.HTTP_404_NOT_FOUND)

    role = request.data.get("role", profile_for(user).role)
    is_active = request.data.get("isActive", user.is_active)
    if role not in UserProfile.Role.values or not isinstance(is_active, bool):
        return Response({"detail": "A valid role and active status are required."}, status=status.HTTP_400_BAD_REQUEST)
    if user.pk == request.user.pk and not is_active:
        return Response({"detail": "You cannot deactivate your own account."}, status=status.HTTP_400_BAD_REQUEST)
    profile = profile_for(user)
    if user.pk == request.user.pk and role != profile.role:
        return Response({"detail": "You cannot change your own role."}, status=status.HTTP_400_BAD_REQUEST)
    if (
        profile.role == UserProfile.Role.ADMINISTRATOR
        and user.is_active
        and (not is_active or role != UserProfile.Role.ADMINISTRATOR)
        and not UserProfile.objects.filter(
            role=UserProfile.Role.ADMINISTRATOR,
            user__is_active=True,
        ).exclude(user=user).exists()
    ):
        return Response(
            {"detail": "At least one active administrator account must remain."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user.is_active = is_active
    user.save(update_fields=["is_active"])
    profile.role = role
    profile.save(update_fields=["role"])
    return Response(user_payload(user))
