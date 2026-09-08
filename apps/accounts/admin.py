from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import BodyMeasurement, HealthCondition, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = [
        "username", "national_id", "email", "role",
        "is_membership_active", "membership_end_date", "is_staff",
    ]
    list_filter = ["role", "is_staff", "is_active"]
    search_fields = DjangoUserAdmin.search_fields + ("national_id", "phone_number")
    fieldsets = DjangoUserAdmin.fieldsets + (
        (
            "Gym profile",
            {
                "fields": (
                    "role", "national_id", "phone_number", "date_of_birth", "gender", "profile_picture",
                    "height_cm", "membership_start_date", "membership_end_date",
                )
            },
        ),
    )


@admin.register(BodyMeasurement)
class BodyMeasurementAdmin(admin.ModelAdmin):
    list_display = ["user", "recorded_at", "weight_kg", "waist_cm", "hips_cm", "whr"]
    list_filter = ["recorded_at"]
    search_fields = ["user__username", "user__first_name", "user__last_name", "user__national_id"]


@admin.register(HealthCondition)
class HealthConditionAdmin(admin.ModelAdmin):
    list_display = ["user", "condition", "description", "created_at"]
    list_filter = ["condition"]
    search_fields = ["user__username", "user__national_id", "description", "notes"]
