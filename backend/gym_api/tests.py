import json
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import Client, TestCase
from django.utils import timezone

from .models import (
    AttendanceRecord,
    GymSettings,
    Member,
    Membership,
    MembershipApprovalAudit,
    MembershipPlan,
    Payment,
    UserProfile,
)
from .serializers import PaymentSerializer

class SnapshotApiTests(TestCase):
    endpoint = "/api/snapshot/"

    def setUp(self):
        self.user = User.objects.create_user(username="admin", password="StrongTestPassword-42")
        UserProfile.objects.create(user=self.user, role=UserProfile.Role.ADMINISTRATOR)
        self.client.force_login(self.user)

    def test_snapshot_requires_authentication(self):
        self.client.logout()

        response = self.client.get(self.endpoint)

        self.assertEqual(response.status_code, 403)

    def test_session_endpoint_reports_anonymous_users_without_an_error(self):
        self.client.logout()

        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"authenticated": False})

    def test_login_returns_the_staff_role(self):
        self.client.logout()

        response = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "admin", "password": "StrongTestPassword-42"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["role"], UserProfile.Role.ADMINISTRATOR)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)

    def test_login_requires_and_accepts_a_csrf_token(self):
        client = Client(enforce_csrf_checks=True)
        csrf_response = client.get("/api/auth/csrf/")
        csrf_token = csrf_response.json()["csrfToken"]

        response = client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "admin", "password": "StrongTestPassword-42"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(response.status_code, 200, response.content)

    def test_administrator_can_create_staff_with_a_role(self):
        response = self.client.post(
            "/api/staff/",
            data=json.dumps({
                "username": "new-receptionist",
                "password": "DifferentStrongPassword-73",
                "role": UserProfile.Role.RECEPTIONIST,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["role"], UserProfile.Role.RECEPTIONIST)
        self.client.logout()

        login_response = self.client.post(
            "/api/auth/login/",
            data=json.dumps({
                "username": "new-receptionist",
                "password": "DifferentStrongPassword-73",
            }),
            content_type="application/json",
        )

        self.assertEqual(login_response.status_code, 200, login_response.content)
        self.assertEqual(login_response.json()["role"], UserProfile.Role.RECEPTIONIST)

    def test_invalid_login_returns_unauthorized(self):
        response = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "admin", "password": "incorrect password"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)

    def test_payment_refunds_are_rejected(self):
        today = timezone.localdate()
        member = Member.objects.create(
            id="PRX-TEST",
            name="Test Member",
            phone="+265 991 000 100",
            emergency_contact="Test contact",
            joined_at=today,
        )
        plan = MembershipPlan.objects.create(
            id="plan-test",
            name="Test Plan",
            description="Test plan",
            duration_days=30,
            price=1000,
            cadence=MembershipPlan.Cadence.MONTHLY,
        )
        membership = Membership.objects.create(
            id="membership-test",
            member=member,
            plan=plan,
            start_date=today,
            end_date=today + timedelta(days=29),
            status=Membership.Status.ACTIVE,
            payment_status=Membership.PaymentStatus.PAID,
            amount_paid=1000,
            amount_due=0,
        )
        original_payment = Payment.objects.create(
            id="RCT-test",
            membership=membership,
            member=member,
            plan_name=plan.name,
            date=today,
            amount=1000,
            method=Payment.Method.CASH,
            status=Payment.Status.CLEARED,
            type=Payment.Type.MEMBERSHIP,
        )
        serializer = PaymentSerializer(data={
            "id": "COR-test",
            "membershipId": membership.pk,
            "correctionOf": original_payment.pk,
            "memberId": member.pk,
            "planName": plan.name,
            "date": today.isoformat(),
            "amount": -100,
            "method": Payment.Method.CASH,
            "status": Payment.Status.CLEARED,
            "type": Payment.Type.CORRECTION,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("type", serializer.errors)

    def test_administrator_cannot_deactivate_their_own_account(self):
        response = self.client.put(
            "/api/staff/",
            data=json.dumps({
                "id": self.user.pk,
                "role": UserProfile.Role.ADMINISTRATOR,
                "isActive": False,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_new_database_contains_no_sample_records(self):
        response = self.client.get(self.endpoint)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["members"], [])
        self.assertEqual(response.json()["plans"], [])
        self.assertEqual(response.json()["memberships"], [])
        self.assertEqual(response.json()["payments"], [])
        self.assertEqual(response.json()["attendance"], [])

    def test_snapshot_records_round_trip_to_database(self):
        today = timezone.localdate()
        snapshot = {
            "members": [{
                "id": "PRX-9001",
                "name": "Test Member",
                "phone": "+265 991 000 001",
                "email": "",
                "address": "",
                "emergencyContact": "Test Contact",
                "notes": "",
                "status": "active",
                "joinedAt": today.isoformat(),
                "initials": "TM",
            }],
            "plans": [{
                "id": "plan-test",
                "name": "Test Plan",
                "description": "Test duration plan",
                "durationDays": 14,
                "price": 15000,
                "cadence": "Custom",
                "status": "active",
            }],
            "memberships": [{
                "id": "membership-test",
                "memberId": "PRX-9001",
                "memberName": "Test Member",
                "planId": "plan-test",
                "planName": "Test Plan",
                "startDate": today.isoformat(),
                "endDate": (today + timedelta(days=13)).isoformat(),
                "status": "active",
                "paymentStatus": "partial",
                "amountPaid": 5000,
                "amountDue": 10000,
            }],
            "payments": [{
                "id": "RCT-test",
                "membershipId": "membership-test",
                "memberId": "PRX-9001",
                "memberName": "Test Member",
                "planName": "Test Plan",
                "date": today.isoformat(),
                "amount": 5000,
                "method": "Cash",
                "reference": "",
                "status": "cleared",
                "type": "membership",
            }],
            "attendance": [{
                "id": "attendance-test",
                "memberId": "PRX-9001",
                "memberName": "Test Member",
                "checkedInAt": timezone.now().isoformat(),
                "status": "checked-in",
            }],
            "settings": {
                "gymName": "Test Gym",
                "logoText": "TG",
                "address": "",
                "phone": "",
                "email": "",
                "currency": "MWK",
                "primaryColor": "#111827",
                "receiptFooter": "",
                "expiryWarningDays": 7,
                "duplicateCheckInMinutes": 30,
            },
        }

        response = self.client.put(
            self.endpoint,
            data=json.dumps(snapshot),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        saved = self.client.get(self.endpoint).json()
        self.assertEqual(saved["members"][0]["id"], "PRX-9001")
        self.assertEqual(saved["memberships"][0]["memberId"], "PRX-9001")
        self.assertEqual(saved["payments"][0]["amount"], 5000.0)
        self.assertEqual(saved["attendance"][0]["memberId"], "PRX-9001")
        self.assertEqual(saved["settings"]["gymName"], "Test Gym")

        snapshot["members"][0]["name"] = "Should Roll Back"
        snapshot["payments"][0]["amount"] = 9000
        response = self.client.put(
            self.endpoint,
            data=json.dumps(snapshot),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        saved = self.client.get(self.endpoint).json()
        self.assertEqual(saved["members"][0]["name"], "Test Member")
        self.assertEqual(saved["payments"][0]["amount"], 5000.0)

    def test_invalid_snapshot_is_rejected_without_partial_writes(self):
        response = self.client.put(
            self.endpoint,
            data=json.dumps({"members": [{"id": "PRX-1"}]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(self.endpoint).json()["members"], [])

    def test_receptionist_cannot_change_plans_or_gym_settings(self):
        receptionist = User.objects.create_user(username="reception", password="StrongTestPassword-42")
        UserProfile.objects.create(user=receptionist, role=UserProfile.Role.RECEPTIONIST)
        self.client.force_login(receptionist)
        payload = self.client.get(self.endpoint).json()
        payload["settings"]["gymName"] = "Unauthorized"

        response = self.client.put(
            self.endpoint,
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(self.endpoint).json()["settings"]["gymName"], "")

    def test_receptionist_cannot_manage_staff(self):
        receptionist = User.objects.create_user(username="reception", password="StrongTestPassword-42")
        UserProfile.objects.create(user=receptionist, role=UserProfile.Role.RECEPTIONIST)
        self.client.force_login(receptionist)

        response = self.client.get("/api/staff/")

        self.assertEqual(response.status_code, 403)

    def test_receptionist_cannot_change_membership_balance_without_a_payment(self):
        today = timezone.localdate()
        payload = {
            "members": [{
                "id": "PRX-9002",
                "name": "Balance Test",
                "phone": "+265 991 000 002",
                "email": "",
                "address": "",
                "emergencyContact": "Contact",
                "notes": "",
                "status": "active",
                "joinedAt": today.isoformat(),
                "initials": "BT",
            }],
            "plans": [{
                "id": "plan-balance",
                "name": "Balance Plan",
                "description": "Test plan",
                "durationDays": 14,
                "price": 15000,
                "cadence": "Custom",
                "status": "active",
            }],
            "memberships": [{
                "id": "membership-balance",
                "memberId": "PRX-9002",
                "memberName": "Balance Test",
                "planId": "plan-balance",
                "planName": "Balance Plan",
                "startDate": today.isoformat(),
                "endDate": (today + timedelta(days=13)).isoformat(),
                "status": "active",
                "paymentStatus": "unpaid",
                "amountPaid": 0,
                "amountDue": 15000,
            }],
            "payments": [],
            "attendance": [],
            "settings": {
                "gymName": "",
                "logoText": "",
                "address": "",
                "phone": "",
                "email": "",
                "currency": "MWK",
                "primaryColor": "#111827",
                "receiptFooter": "",
                "expiryWarningDays": 7,
                "duplicateCheckInMinutes": 30,
            },
        }
        response = self.client.put(
            self.endpoint,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)

        receptionist = User.objects.create_user(username="reception", password="StrongTestPassword-42")
        UserProfile.objects.create(user=receptionist, role=UserProfile.Role.RECEPTIONIST)
        self.client.force_login(receptionist)
        payload["memberships"][0].update({
            "paymentStatus": "paid",
            "amountPaid": 15000,
            "amountDue": 0,
        })

        response = self.client.put(
            self.endpoint,
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            self.client.get(self.endpoint).json()["memberships"][0]["paymentStatus"],
            "unpaid",
        )


class MemberPortalApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="portal-admin", password="StrongTestPassword-42")
        UserProfile.objects.create(user=self.admin, role=UserProfile.Role.ADMINISTRATOR)
        self.client.force_login(self.admin)
        self.member = Member.objects.create(
            id="PORTAL-1",
            name="Portal Member",
            phone="+265 991 111 111",
            email="portal@example.com",
            emergency_contact="Emergency contact",
            joined_at=timezone.localdate(),
        )
        self.plan = MembershipPlan.objects.create(
            id="portal-plan",
            name="Portal Plan",
            description="Portal test plan",
            duration_days=30,
            price=30000,
            cadence=MembershipPlan.Cadence.MONTHLY,
        )

    def create_membership(self, *, payment_status=Membership.PaymentStatus.PAID, days_offset=0):
        today = timezone.localdate() + timedelta(days=days_offset)
        return Membership.objects.create(
            id=f"portal-membership-{payment_status}-{days_offset}",
            member=self.member,
            plan=self.plan,
            start_date=today,
            end_date=today + timedelta(days=29),
            status=Membership.Status.ACTIVE,
            payment_status=payment_status,
            amount_paid=30000 if payment_status == Membership.PaymentStatus.PAID else 0,
            amount_due=0 if payment_status == Membership.PaymentStatus.PAID else 30000,
        )

    def provision_account(self):
        response = self.client.post(
            "/api/member-portal/accounts/",
            data=json.dumps({
                "memberId": self.member.pk,
                "username": "portal-member",
                "password": "StrongMemberPassword-64",
            }),
            content_type="application/json",
        )
        self.member.refresh_from_db()
        return response

    def test_admin_provisions_distinct_member_account_and_login_payload(self):
        response = self.provision_account()

        self.assertEqual(response.status_code, 201, response.content)
        self.member.refresh_from_db()
        self.assertFalse(UserProfile.objects.filter(user=self.member.portal_user).exists())
        self.client.logout()
        login_response = self.client.post(
            "/api/auth/login/",
            data=json.dumps({
                "username": "portal-member",
                "password": "StrongMemberPassword-64",
            }),
            content_type="application/json",
        )
        self.assertEqual(login_response.status_code, 200, login_response.content)
        self.assertEqual(login_response.json()["role"], "member")
        self.assertEqual(login_response.json()["memberId"], self.member.pk)
        self.assertIn("gymName", login_response.json())
        self.assertIn("logoText", login_response.json())

    def test_member_portal_reads_own_summary_and_cannot_access_snapshot(self):
        membership = self.create_membership()
        Payment.objects.create(
            id="portal-payment",
            membership=membership,
            member=self.member,
            plan_name=self.plan.name,
            date=timezone.localdate(),
            amount=30000,
            method=Payment.Method.CASH,
            status=Payment.Status.CLEARED,
            type=Payment.Type.MEMBERSHIP,
        )
        self.provision_account()
        self.client.force_login(self.member.portal_user)

        response = self.client.get("/api/member-portal/me/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(set(response.json()), {"member", "memberships", "payments", "attendance"})
        self.assertEqual(response.json()["member"]["id"], self.member.pk)
        self.assertEqual(response.json()["memberships"][0]["id"], membership.pk)
        self.assertEqual(response.json()["payments"][0]["id"], "portal-payment")
        self.assertEqual(self.client.get("/api/snapshot/").status_code, 403)
        self.assertEqual(self.client.put("/api/snapshot/", data="{}", content_type="application/json").status_code, 403)

    def test_only_admin_can_provision_and_password_validation_is_enforced(self):
        invalid = self.client.post(
            "/api/member-portal/accounts/",
            data=json.dumps({"memberId": self.member.pk, "username": "weak", "password": "123"}),
            content_type="application/json",
        )
        self.assertEqual(invalid.status_code, 400)
        receptionist = User.objects.create_user(username="portal-reception", password="StrongTestPassword-71")
        UserProfile.objects.create(user=receptionist, role=UserProfile.Role.RECEPTIONIST)
        self.client.force_login(receptionist)
        forbidden = self.provision_account()
        self.assertEqual(forbidden.status_code, 403)

    def test_admin_can_reprovision_and_deactivate_portal_credentials(self):
        self.assertEqual(self.provision_account().status_code, 201)
        self.member.refresh_from_db()
        response = self.client.post(
            "/api/member-portal/accounts/",
            data=json.dumps({
                "memberId": self.member.pk,
                "username": "portal-member-updated",
                "password": "AnotherStrongPassword-75",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.member.portal_user.username, "portal-member-updated")
        deactivated = self.client.put(
            "/api/member-portal/accounts/",
            data=json.dumps({"memberId": self.member.pk, "isActive": False}),
            content_type="application/json",
        )
        self.assertEqual(deactivated.status_code, 200, deactivated.content)
        self.member.portal_user.refresh_from_db()
        self.assertFalse(self.member.portal_user.is_active)

    def test_admin_can_deprovision_portal_credentials(self):
        self.provision_account()
        account_id = self.member.portal_user_id
        response = self.client.delete(f"/api/member-portal/accounts/{self.member.pk}/")
        self.assertEqual(response.status_code, 204)
        self.member.refresh_from_db()
        self.assertIsNone(self.member.portal_user_id)
        self.assertFalse(User.objects.filter(pk=account_id).exists())

    def test_public_branding_contract(self):
        GymSettings.objects.create(id=1, gym_name="Test Gym", logo_text="TG")
        response = self.client.get("/api/public/branding/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"gymName": "Test Gym", "logoText": "TG"})

    def test_snapshot_archiving_is_reversible_and_preserves_audit_records(self):
        today = timezone.localdate()
        membership = self.create_membership()
        attendance = AttendanceRecord.objects.create(
            id="archive-attendance",
            member=self.member,
            checked_in_at=timezone.now(),
            status=AttendanceRecord.Status.CHECKED_IN,
        )
        payment = Payment.objects.create(
            id="archive-payment",
            membership=membership,
            member=self.member,
            plan_name=self.plan.name,
            date=today,
            amount=30000,
            method=Payment.Method.CASH,
            status=Payment.Status.CLEARED,
            type=Payment.Type.MEMBERSHIP,
        )
        snapshot = self.client.get("/api/snapshot/").json()
        snapshot["members"][0]["isArchived"] = True
        snapshot["memberships"][0]["isArchived"] = True
        response = self.client.put(
            "/api/snapshot/",
            data=json.dumps(snapshot),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["members"][0]["isArchived"])
        self.assertTrue(response.json()["memberships"][0]["isArchived"])

        snapshot = response.json()
        snapshot["members"][0]["isArchived"] = False
        snapshot["memberships"][0]["isArchived"] = False
        response = self.client.put(
            "/api/snapshot/",
            data=json.dumps(snapshot),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()["members"][0]["isArchived"])
        self.assertFalse(response.json()["memberships"][0]["isArchived"])
        self.assertEqual(AttendanceRecord.objects.filter(pk=attendance.pk).count(), 1)
        self.assertEqual(Payment.objects.filter(pk=payment.pk).count(), 1)
        payment.refresh_from_db()
        self.assertEqual(payment.amount, 30000)

    def test_qr_check_in_validates_membership_and_duplicate_interval(self):
        self.create_membership()
        self.provision_account()
        self.client.force_login(self.member.portal_user)

        token_response = self.client.get("/api/member-portal/qr/")
        self.assertEqual(token_response.status_code, 200, token_response.content)
        self.assertEqual(set(token_response.json()), {"token", "expiresAt"})
        check_in = self.client.post(
            "/api/member-portal/check-in/",
            data=json.dumps({"token": token_response.json()["token"]}),
            content_type="application/json",
        )
        self.assertEqual(check_in.status_code, 201, check_in.content)
        duplicate = self.client.post(
            "/api/member-portal/check-in/",
            data=json.dumps({"token": token_response.json()["token"]}),
            content_type="application/json",
        )
        self.assertEqual(duplicate.status_code, 409)

    def test_unpaid_membership_requires_explicit_admin_approval_for_qr(self):
        membership = self.create_membership(payment_status=Membership.PaymentStatus.UNPAID)
        self.provision_account()
        self.client.force_login(self.member.portal_user)
        self.assertEqual(self.client.get("/api/member-portal/qr/").status_code, 403)
        self.client.force_login(self.admin)

        approved = self.client.post(
            f"/api/memberships/{membership.pk}/approval/",
            data=json.dumps({"approved": True}),
            content_type="application/json",
        )
        self.assertEqual(approved.status_code, 200, approved.content)
        self.assertEqual(approved.json()["membership"]["unpaidApprovedBy"], self.admin.pk)
        self.assertTrue(approved.json()["membership"]["unpaidApprovedAt"])
        revoked = self.client.post(
            f"/api/memberships/{membership.pk}/approval/",
            data=json.dumps({"approved": False}),
            content_type="application/json",
        )
        self.assertEqual(revoked.status_code, 200, revoked.content)
        self.assertEqual(MembershipApprovalAudit.objects.filter(membership=membership).count(), 2)
        self.client.force_login(self.member.portal_user)
        self.assertEqual(self.client.get("/api/member-portal/qr/").status_code, 403)

    def test_qr_token_cannot_be_used_by_another_member(self):
        self.create_membership()
        other = Member.objects.create(
            id="PORTAL-2",
            name="Other Member",
            phone="+265 991 111 112",
            emergency_contact="Emergency contact",
            joined_at=timezone.localdate(),
        )
        self.provision_account()
        self.client.force_login(self.member.portal_user)
        token = self.client.get("/api/member-portal/qr/").json()["token"]
        second_user = User.objects.create_user(username="other-member", password="StrongMemberPassword-87")
        other.portal_user = second_user
        other.save(update_fields=["portal_user"])
        self.client.force_login(second_user)
        response = self.client.post(
            "/api/member-portal/check-in/",
            data=json.dumps({"token": token}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(AttendanceRecord.objects.exists())

    def test_staff_qr_check_in_uses_same_member_eligibility_and_duplicate_rule(self):
        self.create_membership()
        self.provision_account()
        self.client.force_login(self.member.portal_user)
        token = self.client.get("/api/member-portal/qr/").json()["token"]
        receptionist = User.objects.create_user(username="qr-reception", password="StrongTestPassword-89")
        UserProfile.objects.create(user=receptionist, role=UserProfile.Role.RECEPTIONIST)
        self.client.force_login(receptionist)

        response = self.client.post(
            "/api/attendance/qr-check-in/",
            data=json.dumps({"token": token}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["memberId"], self.member.pk)
        duplicate = self.client.post(
            "/api/attendance/qr-check-in/",
            data=json.dumps({"token": token}),
            content_type="application/json",
        )
        self.assertEqual(duplicate.status_code, 409)


class MembershipRenewalApiTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="renew-admin", password="StrongTestPassword-42")
        UserProfile.objects.create(user=self.staff, role=UserProfile.Role.ADMINISTRATOR)
        self.client.force_login(self.staff)
        self.member = Member.objects.create(
            id="RENEW-1",
            name="Renewal Member",
            phone="+265 992 222 221",
            emergency_contact="Emergency contact",
            joined_at=timezone.localdate(),
        )
        self.plan = MembershipPlan.objects.create(
            id="renew-plan",
            name="Renewal Plan",
            description="Renewal test plan",
            duration_days=30,
            price=30000,
            cadence=MembershipPlan.Cadence.MONTHLY,
        )
        today = timezone.localdate()
        self.source = Membership.objects.create(
            id="renew-source",
            member=self.member,
            plan=self.plan,
            start_date=today - timedelta(days=30),
            end_date=today - timedelta(days=1),
            status=Membership.Status.EXPIRED,
            payment_status=Membership.PaymentStatus.PAID,
            amount_paid=30000,
            amount_due=0,
        )

    def renew(self, idempotency_key):
        return self.client.post(
            f"/api/memberships/{self.source.pk}/renew/",
            data=json.dumps({
                "requestId": idempotency_key,
            }),
            content_type="application/json",
        )

    def test_renewal_is_idempotent_and_consecutive_memberships_do_not_overlap(self):
        first = self.renew("renewal-one")
        repeated = self.renew("renewal-one")
        next_renewal = self.renew("renewal-two")

        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(repeated.status_code, 200, repeated.content)
        self.assertEqual(first.json()["membership"]["id"], repeated.json()["membership"]["id"])
        self.assertEqual(next_renewal.status_code, 201, next_renewal.content)
        self.assertEqual(
            Membership.objects.get(pk=first.json()["membership"]["id"]).end_date + timedelta(days=1),
            Membership.objects.get(pk=next_renewal.json()["membership"]["id"]).start_date,
        )
        self.assertEqual(Membership.objects.filter(member=self.member).count(), 3)

    def test_reusing_idempotency_key_for_different_request_is_rejected(self):
        self.renew("reused-key")
        other_member = Member.objects.create(
            id="RENEW-2",
            name="Second Renewal Member",
            phone="+265 992 222 222",
            emergency_contact="Emergency contact",
            joined_at=timezone.localdate(),
        )
        other_source = Membership.objects.create(
            id="renew-source-other",
            member=other_member,
            plan=self.plan,
            start_date=timezone.localdate() - timedelta(days=30),
            end_date=timezone.localdate() - timedelta(days=1),
            status=Membership.Status.EXPIRED,
            payment_status=Membership.PaymentStatus.PAID,
            amount_paid=30000,
            amount_due=0,
        )
        response = self.client.post(
            f"/api/memberships/{other_source.pk}/renew/",
            data=json.dumps({
                "requestId": "reused-key",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)


class DjangoAdminUserRoleTests(TestCase):
    def setUp(self):
        admin_user = User.objects.create_superuser(
            username="django-admin",
            email="admin@example.com",
            password="StrongAdminPassword-52",
        )
        self.client.force_login(admin_user)

    def test_user_creation_form_exposes_staff_role_choices(self):
        response = self.client.get("/admin/auth/user/add/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Gym staff role")
        self.assertContains(response, 'value="administrator"')
        self.assertContains(response, 'value="receptionist"')

    def test_selected_staff_role_is_saved_with_new_user(self):
        response = self.client.post(
            "/admin/auth/user/add/",
            data={
                "username": "admin-created-receptionist",
                "password1": "StrongStaffPassword-63",
                "password2": "StrongStaffPassword-63",
                "gym_profile-TOTAL_FORMS": "1",
                "gym_profile-INITIAL_FORMS": "0",
                "gym_profile-MIN_NUM_FORMS": "0",
                "gym_profile-MAX_NUM_FORMS": "1",
                "gym_profile-0-role": UserProfile.Role.RECEPTIONIST,
            },
        )

        self.assertEqual(response.status_code, 302, response.content)
        created_user = User.objects.get(username="admin-created-receptionist")
        self.assertEqual(created_user.gym_profile.role, UserProfile.Role.RECEPTIONIST)
