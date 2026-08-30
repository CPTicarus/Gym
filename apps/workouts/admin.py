from django.contrib import admin

from .models import (
    DailyExercise,
    WarmupExercise,
    WorkoutAssignment,
    WorkoutDay,
    WorkoutDayExercise,
    WorkoutPlan,
)


class WarmupExerciseInline(admin.TabularInline):
    model = WarmupExercise
    extra = 1


class DailyExerciseInline(admin.TabularInline):
    model = DailyExercise
    extra = 1


class WorkoutDayInline(admin.TabularInline):
    model = WorkoutDay
    extra = 1


class WorkoutDayExerciseInline(admin.TabularInline):
    model = WorkoutDayExercise
    extra = 1


@admin.register(WorkoutPlan)
class WorkoutPlanAdmin(admin.ModelAdmin):
    list_display = ["name", "goal", "is_template", "created_by", "created_at"]
    list_filter = ["goal", "is_template"]
    search_fields = ["name", "description"]
    inlines = [WarmupExerciseInline, WorkoutDayInline, DailyExerciseInline]


@admin.register(WorkoutDay)
class WorkoutDayAdmin(admin.ModelAdmin):
    list_display = ["plan", "name", "order"]
    inlines = [WorkoutDayExerciseInline]


@admin.register(WorkoutAssignment)
class WorkoutAssignmentAdmin(admin.ModelAdmin):
    list_display = ["plan", "user", "status", "assigned_by", "assigned_at"]
    list_filter = ["status"]
    search_fields = ["plan__name", "user__username", "user__email"]
