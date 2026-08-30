from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    DailyExerciseViewSet,
    MyWorkoutPlansView,
    WarmupExerciseViewSet,
    WorkoutDayExerciseViewSet,
    WorkoutDayViewSet,
    WorkoutPlanViewSet,
)

router = DefaultRouter()
router.register("workout-plans", WorkoutPlanViewSet, basename="workout-plan")
# router also auto-generates POST /workout-plans/{id}/assign/ from the @action

warmup_list = WarmupExerciseViewSet.as_view({"get": "list", "post": "create"})
warmup_detail = WarmupExerciseViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

day_list = WorkoutDayViewSet.as_view({"get": "list", "post": "create"})
day_detail = WorkoutDayViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

day_exercise_list = WorkoutDayExerciseViewSet.as_view({"get": "list", "post": "create"})
day_exercise_detail = WorkoutDayExerciseViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

daily_list = DailyExerciseViewSet.as_view({"get": "list", "post": "create"})
daily_detail = DailyExerciseViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

urlpatterns = router.urls + [
    # Section 1: warmup
    path("workout-plans/<int:plan_pk>/warmup/", warmup_list, name="plan-warmup-list"),
    path("workout-plans/<int:plan_pk>/warmup/<int:pk>/", warmup_detail, name="plan-warmup-detail"),

    # Section 2: days + exercises within a day
    path("workout-plans/<int:plan_pk>/days/", day_list, name="plan-day-list"),
    path("workout-plans/<int:plan_pk>/days/<int:pk>/", day_detail, name="plan-day-detail"),
    path(
        "workout-plans/<int:plan_pk>/days/<int:day_pk>/exercises/",
        day_exercise_list,
        name="plan-day-exercise-list",
    ),
    path(
        "workout-plans/<int:plan_pk>/days/<int:day_pk>/exercises/<int:pk>/",
        day_exercise_detail,
        name="plan-day-exercise-detail",
    ),

    # Section 3: daily items
    path("workout-plans/<int:plan_pk>/daily/", daily_list, name="plan-daily-list"),
    path("workout-plans/<int:plan_pk>/daily/<int:pk>/", daily_detail, name="plan-daily-detail"),

    # Member-facing
    path("my-workout-plans/", MyWorkoutPlansView.as_view(), name="my-workout-plans"),
]
