from rest_framework import serializers

from django.db.models import Q
from django.utils import timezone

from .models import AttendanceRecord, GymSettings, Member, Membership, MembershipPlan, Payment


class MemberSerializer(serializers.ModelSerializer):
    emergencyContact = serializers.CharField(source="emergency_contact")
    joinedAt = serializers.DateField(source="joined_at")
    initials = serializers.SerializerMethodField()
    isArchived = serializers.BooleanField(source="is_archived", required=False)

    class Meta:
        model = Member
        fields = (
            "id", "name", "phone", "email", "address", "emergencyContact",
            "notes", "status", "joinedAt", "initials", "isArchived",
        )

    def get_initials(self, instance):
        return "".join(part[0].upper() for part in instance.name.split()[:2])


class MembershipPlanSerializer(serializers.ModelSerializer):
    durationDays = serializers.IntegerField(source="duration_days")

    class Meta:
        model = MembershipPlan
        fields = ("id", "name", "description", "durationDays", "price", "cadence", "status")


class MembershipSerializer(serializers.ModelSerializer):
    memberId = serializers.PrimaryKeyRelatedField(source="member", queryset=Member.objects.all())
    memberName = serializers.CharField(source="member.name", read_only=True)
    planId = serializers.PrimaryKeyRelatedField(source="plan", queryset=MembershipPlan.objects.all())
    planName = serializers.CharField(source="plan.name", read_only=True)
    startDate = serializers.DateField(source="start_date")
    endDate = serializers.DateField(source="end_date")
    paymentStatus = serializers.ChoiceField(source="payment_status", choices=Membership.PaymentStatus.choices)
    amountPaid = serializers.DecimalField(source="amount_paid", max_digits=12, decimal_places=2, coerce_to_string=False)
    amountDue = serializers.DecimalField(source="amount_due", max_digits=12, decimal_places=2, coerce_to_string=False)
    isArchived = serializers.BooleanField(source="is_archived", required=False)
    unpaidApprovedBy = serializers.IntegerField(
        source="unpaid_approved_by_id", read_only=True, allow_null=True,
    )
    unpaidApprovedAt = serializers.DateTimeField(
        source="unpaid_approved_at", read_only=True, allow_null=True,
    )

    class Meta:
        model = Membership
        fields = (
            "id", "memberId", "memberName", "planId", "planName", "startDate",
            "endDate", "status", "paymentStatus", "amountPaid", "amountDue",
            "isArchived", "unpaidApprovedBy", "unpaidApprovedAt",
        )

    def validate(self, attrs):
        if self.instance is not None:
            immutable_fields = ("member", "plan", "start_date", "end_date", "status")
            for field in immutable_fields:
                if field in attrs and getattr(self.instance, field) != attrs[field]:
                    raise serializers.ValidationError(
                        "Membership assignment details cannot be changed."
                    )
        return attrs


class PaymentSerializer(serializers.ModelSerializer):
    membershipId = serializers.PrimaryKeyRelatedField(
        source="membership", queryset=Membership.objects.all(), required=False, allow_null=True,
    )
    correctionOf = serializers.PrimaryKeyRelatedField(
        source="correction_of", queryset=Payment.objects.all(), required=False, allow_null=True,
    )
    memberId = serializers.PrimaryKeyRelatedField(source="member", queryset=Member.objects.all())
    memberName = serializers.CharField(source="member.name", read_only=True)
    planName = serializers.CharField(source="plan_name")
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False)

    class Meta:
        model = Payment
        fields = (
            "id", "membershipId", "correctionOf", "memberId", "memberName",
            "planName", "date", "amount", "method", "reference", "status", "type", "note",
        )

    def validate(self, attrs):
        if self.instance is None:
            method = attrs.get("method")
            reference = attrs.get("reference", "").strip()
            payment_type = attrs.get("type")
            amount = attrs.get("amount")
            if method != Payment.Method.CASH and not reference:
                raise serializers.ValidationError(
                    {"reference": "A reference is required for non-cash payments."}
                )
            if payment_type == Payment.Type.CORRECTION:
                raise serializers.ValidationError(
                    {"type": "Payment corrections and refunds are not supported."}
                )
            elif amount <= 0:
                raise serializers.ValidationError({"amount": "Recorded payments must be positive."})
        return attrs

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            if getattr(instance, field) != value:
                raise serializers.ValidationError(
                    "Payment records cannot be changed."
                )
        return instance


class AttendanceSerializer(serializers.ModelSerializer):
    memberId = serializers.PrimaryKeyRelatedField(source="member", queryset=Member.objects.all())
    memberName = serializers.CharField(source="member.name", read_only=True)
    checkedInAt = serializers.DateTimeField(source="checked_in_at")

    class Meta:
        model = AttendanceRecord
        fields = ("id", "memberId", "memberName", "checkedInAt", "status")

    def validate(self, attrs):
        if self.instance is None:
            member = attrs["member"]
            checked_in_at = attrs["checked_in_at"]
            if member.status != Member.Status.ACTIVE or member.is_archived:
                raise serializers.ValidationError(
                    {"memberId": "Inactive members cannot check in."}
                )
            check_in_date = timezone.localtime(checked_in_at).date()
            has_valid_membership = Membership.objects.filter(
                member=member,
                start_date__lte=check_in_date,
                end_date__gte=check_in_date,
            ).filter(is_archived=False).filter(
                Q(payment_status__in=[
                    Membership.PaymentStatus.PAID,
                    Membership.PaymentStatus.PARTIAL,
                ]) | Q(
                    payment_status=Membership.PaymentStatus.UNPAID,
                    unpaid_approved_at__isnull=False,
                    unpaid_approved_by__isnull=False,
                )
            ).exists()
            if not has_valid_membership:
                raise serializers.ValidationError(
                    {"memberId": "A valid, paid or partially paid membership is required."}
                )
            settings = GymSettings.objects.filter(pk=1).first()
            interval = settings.duplicate_check_in_minutes if settings else 30
            if interval:
                latest = AttendanceRecord.objects.filter(member=member).order_by("-checked_in_at").first()
                if latest:
                    elapsed = (checked_in_at - latest.checked_in_at).total_seconds() / 60
                    if 0 <= elapsed < interval:
                        raise serializers.ValidationError(
                            {"checkedInAt": "A check-in was already recorded within the duplicate interval."}
                        )
        return attrs

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            if getattr(instance, field) != value:
                raise serializers.ValidationError("Attendance history is append-only.")
        return instance


class GymSettingsSerializer(serializers.ModelSerializer):
    gymName = serializers.CharField(source="gym_name", allow_blank=True)
    logoText = serializers.CharField(source="logo_text", allow_blank=True)
    primaryColor = serializers.RegexField(source="primary_color", regex=r"^#[0-9A-Fa-f]{6}$")
    receiptFooter = serializers.CharField(source="receipt_footer", allow_blank=True)
    expiryWarningDays = serializers.IntegerField(source="expiry_warning_days", min_value=1, max_value=365)
    duplicateCheckInMinutes = serializers.IntegerField(source="duplicate_check_in_minutes", min_value=0, max_value=1440)

    class Meta:
        model = GymSettings
        fields = (
            "gymName", "logoText", "address", "phone", "email", "currency",
            "primaryColor", "receiptFooter", "expiryWarningDays", "duplicateCheckInMinutes",
        )
