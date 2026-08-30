from django.contrib import admin

from .models import DietAssignment, DietItem, DietPlan, Meal


class DietItemInline(admin.TabularInline):
    model = DietItem
    extra = 1


class MealInline(admin.TabularInline):
    model = Meal
    extra = 1


@admin.register(DietPlan)
class DietPlanAdmin(admin.ModelAdmin):
    list_display = ["name", "goal", "created_by", "created_at"]
    list_filter = ["goal"]
    search_fields = ["name", "description"]
    inlines = [MealInline]


@admin.register(Meal)
class MealAdmin(admin.ModelAdmin):
    list_display = ["plan", "name", "time", "order"]
    inlines = [DietItemInline]


@admin.register(DietAssignment)
class DietAssignmentAdmin(admin.ModelAdmin):
    list_display = ["plan", "user", "status", "assigned_by", "assigned_at"]
    list_filter = ["status"]
    search_fields = ["plan__name", "user__username", "user__email"]
