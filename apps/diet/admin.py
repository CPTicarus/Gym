from django.contrib import admin

from .models import DietAssignment, DietDay, DietItem, DietPlan, Meal


class DietItemInline(admin.TabularInline):
    model = DietItem
    extra = 1


class MealInline(admin.TabularInline):
    model = Meal
    extra = 1


class DietDayInline(admin.TabularInline):
    model = DietDay
    extra = 0
    can_delete = False


@admin.register(DietPlan)
class DietPlanAdmin(admin.ModelAdmin):
    list_display = ["name", "goal", "created_by", "created_at"]
    list_filter = ["goal"]
    search_fields = ["name", "description"]
    inlines = [DietDayInline]


@admin.register(DietDay)
class DietDayAdmin(admin.ModelAdmin):
    list_display = ["plan", "day_of_week"]
    list_filter = ["day_of_week"]
    inlines = [MealInline]


@admin.register(Meal)
class MealAdmin(admin.ModelAdmin):
    list_display = ["day", "name", "time", "order"]
    inlines = [DietItemInline]


@admin.register(DietAssignment)
class DietAssignmentAdmin(admin.ModelAdmin):
    list_display = ["plan", "user", "status", "assigned_by", "assigned_at"]
    list_filter = ["status"]
    search_fields = ["plan__name", "user__username", "user__email"]
