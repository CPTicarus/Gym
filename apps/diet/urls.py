from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DietItemViewSet, DietPlanViewSet, MealViewSet, MyDietPlansView

router = DefaultRouter()
router.register("diet-plans", DietPlanViewSet, basename="diet-plan")
# router also auto-generates POST /diet-plans/{id}/assign/ from the @action

meal_list = MealViewSet.as_view({"get": "list", "post": "create"})
meal_detail = MealViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

item_list = DietItemViewSet.as_view({"get": "list", "post": "create"})
item_detail = DietItemViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

urlpatterns = router.urls + [
    path("diet-plans/<int:plan_pk>/meals/", meal_list, name="plan-meal-list"),
    path("diet-plans/<int:plan_pk>/meals/<int:pk>/", meal_detail, name="plan-meal-detail"),
    path(
        "diet-plans/<int:plan_pk>/meals/<int:meal_pk>/items/",
        item_list,
        name="plan-meal-item-list",
    ),
    path(
        "diet-plans/<int:plan_pk>/meals/<int:meal_pk>/items/<int:pk>/",
        item_detail,
        name="plan-meal-item-detail",
    ),

    # Member-facing
    path("my-diet-plans/", MyDietPlansView.as_view(), name="my-diet-plans"),
]
