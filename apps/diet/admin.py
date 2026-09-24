from django.contrib import admin

from .models import AllowedFood, DietAssignment, DietDay, DietItem, DietPlan, Food, Meal


@admin.register(Food)
class FoodAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "serving_size", "unit", *Food.NUTRIENT_FIELDS[:4]]
    list_filter = ["category", "unit"]
    search_fields = ["name", "alias"]


class DietItemInline(admin.TabularInline):
    model = DietItem
    extra = 1
    autocomplete_fields = ["food"]


class AllowedFoodInline(admin.TabularInline):
    model = AllowedFood
    extra = 1
    autocomplete_fields = ["food"]


class MealInline(admin.TabularInline):
    model = Meal
    extra = 1


class DietDayInline(admin.TabularInline):
    model = DietDay
    extra = 0
    can_delete = False


@admin.register(DietPlan)
class DietPlanAdmin(admin.ModelAdmin):
    list_display = ["name", "kind", "goal", "created_by", "created_at"]
    list_filter = ["kind", "goal"]
    search_fields = ["name", "description"]
    inlines = [DietDayInline, AllowedFoodInline]


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
