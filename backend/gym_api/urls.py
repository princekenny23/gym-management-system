from django.urls import path

from .views import (
    approve_unpaid_membership,
    csrf_token,
    member_portal_accounts,
    member_portal_check_in,
    member_portal_me,
    member_portal_qr,
    public_branding,
    renew_membership,
    staff_qr_check_in,
    session_login,
    session_logout,
    session_user,
    snapshot,
    staff,
)

urlpatterns = [
    path("snapshot/", snapshot, name="snapshot"),
    path("public/branding/", public_branding, name="public-branding"),
    path("auth/csrf/", csrf_token, name="csrf-token"),
    path("auth/login/", session_login, name="session-login"),
    path("auth/logout/", session_logout, name="session-logout"),
    path("auth/me/", session_user, name="session-user"),
    path("staff/", staff, name="staff"),
    path("attendance/qr-check-in/", staff_qr_check_in, name="attendance-qr-check-in"),
    path("member-portal/me/", member_portal_me, name="member-portal-me"),
    path("member-portal/qr/", member_portal_qr, name="member-portal-qr"),
    path("member-portal/check-in/", member_portal_check_in, name="member-portal-check-in"),
    path("member-portal/accounts/", member_portal_accounts, name="member-portal-accounts"),
    path("member-portal/accounts/<str:member_id>/", member_portal_accounts, name="member-portal-account-delete"),
    path("memberships/<str:membership_id>/renew/", renew_membership, name="membership-renew"),
    path("memberships/<str:membership_id>/approval/", approve_unpaid_membership, name="membership-approval"),
]
