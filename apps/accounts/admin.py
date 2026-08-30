from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ["username", "email", "role", "is_membership_active", "membership_end_date", "is_staff"]
    list_filter = ["role", "is_staff", "is_active"]
    fieldsets = DjangoUserAdmin.fieldsets + (
        (
            "Gym profile",
            {
                "fields": (
                    "role", "phone_number", "date_of_birth", "gender", "profile_picture",
                    "membership_start_date", "membership_end_date",
                )
            },
        ),
    )
