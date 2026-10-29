from django.db import models
from django.contrib.auth.models import User


class Member(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    id = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=40, unique=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=240, blank=True)
    emergency_contact = models.CharField(max_length=120)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    joined_at = models.DateField()
    is_archived = models.BooleanField(default=False)
    portal_user = models.OneToOneField(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="portal_member",
    )

    def __str__(self):
        return f"{self.name} ({self.id})"


class MembershipPlan(models.Model):
    class Cadence(models.TextChoices):
        DAILY = "Daily", "Daily"
        WEEKLY = "Weekly", "Weekly"
        MONTHLY = "Monthly", "Monthly"
        QUARTERLY = "Quarterly", "Quarterly"
        ANNUAL = "Annual", "Annual"
        CUSTOM = "Custom", "Custom"

    id = models.CharField(primary_key=True, max_length=64)
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField()
    duration_days = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=12, decimal_places=2)
    cadence = models.CharField(max_length=12, choices=Cadence.choices)
    status = models.CharField(
        max_length=10,
        choices=Member.Status.choices,
        default=Member.Status.ACTIVE,
    )

    def __str__(self):
        return self.name


class Membership(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        EXPIRED = "expired", "Expired"
        PENDING = "pending", "Pending"
        EXPIRING_SOON = "expiring-soon", "Expiring soon"

    class PaymentStatus(models.TextChoices):
        PAID = "paid", "Paid"
        PARTIAL = "partial", "Partial"
        UNPAID = "unpaid", "Unpaid"

    id = models.CharField(primary_key=True, max_length=64)
    member = models.ForeignKey(Member, on_delete=models.PROTECT, related_name="memberships")
    plan = models.ForeignKey(MembershipPlan, on_delete=models.PROTECT, related_name="memberships")
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices)
    payment_status = models.CharField(max_length=10, choices=PaymentStatus.choices)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_archived = models.BooleanField(default=False)
    unpaid_approved_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_unpaid_memberships",
    )
    unpaid_approved_at = models.DateTimeField(null=True, blank=True)


class MembershipRenewalRequest(models.Model):
    idempotency_key = models.CharField(max_length=120, unique=True)
    membership = models.OneToOneField(
        Membership,
        on_delete=models.PROTECT,
        related_name="renewal_request",
    )
    created_at = models.DateTimeField(auto_now_add=True)


class MembershipApprovalAudit(models.Model):
    class Action(models.TextChoices):
        APPROVED = "approved", "Approved"
        REVOKED = "revoked", "Revoked"

    membership = models.ForeignKey(
        Membership,
        on_delete=models.PROTECT,
        related_name="approval_audit",
    )
    action = models.CharField(max_length=10, choices=Action.choices)
    changed_by = models.ForeignKey(User, on_delete=models.PROTECT)
    changed_at = models.DateTimeField(auto_now_add=True)


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "Cash", "Cash"
        BANK_TRANSFER = "Bank transfer", "Bank transfer"
        MOBILE_MONEY = "Mobile money", "Mobile money"

    class Status(models.TextChoices):
        CLEARED = "cleared", "Cleared"
        PENDING = "pending", "Pending"

    class Type(models.TextChoices):
        MEMBERSHIP = "membership", "Membership"
        CORRECTION = "correction", "Correction"
        TOP_UP = "top-up", "Top-up"

    id = models.CharField(primary_key=True, max_length=80)
    membership = models.ForeignKey(
        Membership,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="payments",
    )
    correction_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="corrections",
    )
    member = models.ForeignKey(Member, on_delete=models.PROTECT, related_name="payments")
    plan_name = models.CharField(max_length=120)
    date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=Method.choices)
    reference = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices)
    type = models.CharField(max_length=12, choices=Type.choices)
    note = models.TextField(blank=True)


class AttendanceRecord(models.Model):
    class Status(models.TextChoices):
        CHECKED_IN = "checked-in", "Checked in"
        DUPLICATE = "duplicate", "Duplicate"

    id = models.CharField(primary_key=True, max_length=64)
    member = models.ForeignKey(Member, on_delete=models.PROTECT, related_name="attendance")
    checked_in_at = models.DateTimeField()
    status = models.CharField(max_length=12, choices=Status.choices)


class GymSettings(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    gym_name = models.CharField(max_length=160, blank=True)
    logo_text = models.CharField(max_length=12, blank=True)
    address = models.CharField(max_length=240, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    currency = models.CharField(max_length=8, default="MWK")
    primary_color = models.CharField(max_length=7, default="#111827")
    receipt_footer = models.CharField(max_length=240, blank=True)
    expiry_warning_days = models.PositiveSmallIntegerField(default=7)
    duplicate_check_in_minutes = models.PositiveSmallIntegerField(default=30)


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMINISTRATOR = "administrator", "Administrator"
        RECEPTIONIST = "receptionist", "Receptionist"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="gym_profile")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.RECEPTIONIST)

    def __str__(self):
        return f"{self.user.username} ({self.role})"
