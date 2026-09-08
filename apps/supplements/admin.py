from django.contrib import admin

from .models import SupplementAssignment, SupplementItem, SupplementPlan


class SupplementItemInline(admin.TabularInline):
    model = SupplementItem
    extra = 1


@admin.register(SupplementPlan)
class SupplementPlanAdmin(admin.ModelAdmin):
    list_display = ["name", "goal", "created_by", "created_at"]
    list_filter = ["goal"]
    search_fields = ["name", "description", "items__name"]
    inlines = [SupplementItemInline]


@admin.register(SupplementAssignment)
class SupplementAssignmentAdmin(admin.ModelAdmin):
    list_display = ["plan", "user", "status", "assigned_by", "assigned_at"]
    list_filter = ["status"]
    search_fields = ["plan__name", "user__username", "user__national_id"]
