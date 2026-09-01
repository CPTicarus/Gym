from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User, WeightLog


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
                    "height_cm", "membership_start_date", "membership_end_date",
                )
            },
        ),
    )


@admin.register(WeightLog)
class WeightLogAdmin(admin.ModelAdmin):
    list_display = ["user", "weight_kg", "recorded_at"]
    list_filter = ["recorded_at"]
    search_fields = ["user__username", "user__first_name", "user__last_name"]
