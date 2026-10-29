from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User

from .models import UserProfile


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    fields = ("role",)
    extra = 1
    max_num = 1
    can_delete = False
    verbose_name = "Gym staff role"
    verbose_name_plural = "Gym staff role"


class GymUserAdmin(UserAdmin):
    inlines = (UserProfileInline,)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        if not hasattr(form.instance, "gym_profile"):
            default_role = (
                UserProfile.Role.ADMINISTRATOR
                if form.instance.is_superuser
                else UserProfile.Role.RECEPTIONIST
            )
            UserProfile.objects.create(user=form.instance, role=default_role)


admin.site.unregister(User)
admin.site.register(User, GymUserAdmin)
