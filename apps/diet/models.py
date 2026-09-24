from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

# Generous enough for anything real (a food's sodium per 100 g of salt is
# ~39,000 mg) while still turning away a stray extra zero typed into a
# form, or a number big enough to overflow once it's scaled for display.
_MAX_QUANTITY = 100_000


def validate_positive(value):
    """Amounts and serving sizes are divisors when nutrition is scaled
    (amount / serving_size), and a zero or negative one is never what
    anybody meant. On the model field rather than the serializer so the
    Django admin is held to it too — DRF copies model validators onto its
    fields, so the API gets the same rule from this one definition."""
    if value is not None and value <= 0:
        raise ValidationError("Must be greater than zero.")


class Food(models.Model):
    """One entry in the food library: what a food IS, entered once —
    "chicken breast: per 100 g, 165 kcal, 31 g protein...". Diet plans then
    only say HOW MUCH of it (DietItem.amount), and the nutrition shown for
    "200 g" is these numbers scaled by 200 / 100.

    This is to diet plans what Move is to workout plans: a library built
    once and referenced from every plan, so correcting a number here
    corrects it in every plan that uses the food, instead of in each copy
    somebody typed by hand.

    Every nutrient is optional, and null means "not entered", which is not
    the same as zero — chicken's carbs are 0, its fibre may simply be
    unknown. Totals skip nulls rather than counting them as zero (see
    front/src/utils/nutrition.js, the one place the scaling is done).
    """

    class Category(models.TextChoices):
        PROTEIN = "protein", "Meat & Protein"
        GRAINS = "grains", "Bread & Grains"
        DAIRY = "dairy", "Dairy"
        LEGUMES = "legumes", "Legumes"
        VEGETABLES = "vegetables", "Vegetables"
        FRUITS = "fruits", "Fruits"
        FATS = "fats", "Fats & Nuts"
        BEVERAGES = "beverages", "Beverages"
        OTHER = "other", "Other"

    class Unit(models.TextChoices):
        GRAM = "g", "Gram"
        MILLILITER = "ml", "Milliliter"
        PIECE = "piece", "Piece"
        SLICE = "slice", "Slice"
        CUP = "cup", "Cup"
        BOWL = "bowl", "Bowl"
        TABLESPOON = "tbsp", "Tablespoon"
        TEASPOON = "tsp", "Teaspoon"
        PORTION = "portion", "Portion"

    # The nutrient columns, in display order — the one list anything that
    # walks "every nutrient" reads, so adding one is a field below plus an
    # entry here (and in NUTRIENTS in front/src/constants/foodOptions.js).
    NUTRIENT_FIELDS = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"]

    name = models.CharField(max_length=100)
    alias = models.CharField(max_length=100, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, blank=True)

    # The nutrients below are per `serving_size` of `unit`: "per 100 g" for
    # most things, "per 1 piece" for an egg. Amounts in a plan are in this
    # same unit, which is why the API refuses to change it once the food is
    # in a plan (see FoodSerializer.validate_unit).
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.GRAM)
    serving_size = models.FloatField(
        default=100, validators=[validate_positive, MaxValueValidator(_MAX_QUANTITY)]
    )

    calories = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(_MAX_QUANTITY)]
    )
    protein_g = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(_MAX_QUANTITY)]
    )
    carbs_g = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(_MAX_QUANTITY)]
    )
    fat_g = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(_MAX_QUANTITY)]
    )
    fiber_g = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(_MAX_QUANTITY)]
    )
    sugar_g = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(_MAX_QUANTITY)]
    )
    sodium_mg = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(_MAX_QUANTITY)]
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="foods_created",
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def is_in_use(self):
        return self.diet_items.exists() or self.allowed_in.exists()

    def plan_names(self):
        """Names of the plans this food appears in — what a trainer needs
        to hear when it can't be deleted."""
        return list(
            DietPlan.objects.filter(
                models.Q(days__meals__items__food=self) | models.Q(allowed_foods__food=self)
            )
            .distinct()
            .order_by("name")
            .values_list("name", flat=True)
        )


class DietPlan(models.Model):
    """An optional plan trainers/admins can give a member alongside (or
    instead of) a workout plan. Same assignment pattern as workouts: build
    the plan once, then hand it to whichever members need it.

    It comes in two kinds, fixed when the plan is created:

      weekly   the "hard" plan — seven days, each with its own meals and an
               exact amount of each food.
      allowed  a list of foods the member may eat, with no days, meals or
               set times (AllowedFood). For members who do better choosing
               from a list than following a menu to the gram.

    They're different shapes of data, not two views of one, so switching a
    plan between them isn't offered — duplicate or rebuild instead.
    """

    class Goal(models.TextChoices):
        WEIGHT_LOSS = "weight_loss", "Weight Loss"
        MUSCLE_GAIN = "muscle_gain", "Muscle Gain"
        MAINTENANCE = "maintenance", "Maintenance"
        GENERAL_HEALTH = "general_health", "General Health"
        OTHER = "other", "Other"

    class Kind(models.TextChoices):
        WEEKLY = "weekly", "Weekly meal plan"
        ALLOWED = "allowed", "Allowed foods list"

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    goal = models.CharField(max_length=30, choices=Goal.choices, blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.WEEKLY)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="diet_plans_created",
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class DietDay(models.Model):
    """One day of the week within a weekly diet plan — always exactly 7
    per plan (Saturday–Friday, the Persian week), auto-created when the
    plan is made (see DietPlanViewSet.perform_create). Unlike WorkoutDay,
    these aren't added or removed by a trainer — a weekly plan is always a
    full week; it's the meals within each day that get built out. An
    "allowed foods" plan has none."""

    class Weekday(models.IntegerChoices):
        SATURDAY = 0, "Saturday"
        SUNDAY = 1, "Sunday"
        MONDAY = 2, "Monday"
        TUESDAY = 3, "Tuesday"
        WEDNESDAY = 4, "Wednesday"
        THURSDAY = 5, "Thursday"
        FRIDAY = 6, "Friday"

    plan = models.ForeignKey(DietPlan, related_name="days", on_delete=models.CASCADE)
    day_of_week = models.PositiveSmallIntegerField(choices=Weekday.choices)

    class Meta:
        ordering = ["day_of_week"]
        constraints = [
            models.UniqueConstraint(fields=["plan", "day_of_week"], name="unique_diet_day_per_plan")
        ]

    def __str__(self):
        return f"{self.plan.name} - {self.get_day_of_week_display()}"


class DietAssignment(models.Model):
    """Who currently has this diet plan, mirroring WorkoutAssignment so the
    two features behave the same way from a frontend's perspective."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"

    plan = models.ForeignKey(DietPlan, related_name="assignments", on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="diet_assignments", on_delete=models.CASCADE
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", on_delete=models.SET_NULL, null=True
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assigned_at"]

    def __str__(self):
        return f"{self.plan.name} -> {self.user} ({self.status})"

    def save(self, *args, **kwargs):
        # A member has at most one active diet plan at a time — anything
        # else is history (paused/completed). Enforced here rather than
        # only in the assign view so it also covers reactivating an old
        # assignment (PATCH status back to "active") through any path.
        if self.status == self.Status.ACTIVE:
            DietAssignment.objects.filter(user_id=self.user_id, status=self.Status.ACTIVE).exclude(
                pk=self.pk
            ).update(status=self.Status.COMPLETED)
        super().save(*args, **kwargs)


class Meal(models.Model):
    """One meal slot within a specific day of the plan (Breakfast, Lunch,
    pre-workout snack...). Free-text name rather than fixed choices —
    trainers name meals however fits the member's schedule."""

    day = models.ForeignKey(DietDay, related_name="meals", on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    time = models.TimeField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.day} - {self.name}"


class DietItem(models.Model):
    """One food in a meal: which food from the library, and how much of it
    in that food's own unit ("200" of a food measured in grams is 200 g).

    No nutrition is stored here. It's the food's per-serving numbers scaled
    by amount / serving_size, worked out where it's displayed — so fixing a
    food in the library fixes every meal it's in."""

    meal = models.ForeignKey(Meal, related_name="items", on_delete=models.CASCADE)
    food = models.ForeignKey(Food, related_name="diet_items", on_delete=models.PROTECT)
    amount = models.FloatField(validators=[validate_positive, MaxValueValidator(_MAX_QUANTITY)])
    notes = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.meal}: {self.food.name}"


class AllowedFood(models.Model):
    """One entry on an "allowed foods" plan (DietPlan.Kind.ALLOWED): a food
    the member may choose, rather than a set meal at a set time.

    The amount is optional. "Chicken breast" alone is a complete answer on
    a plan like this; "up to 200 g" is extra guidance a trainer can add,
    with `notes` to say whether that's per meal or per day."""

    plan = models.ForeignKey(DietPlan, related_name="allowed_foods", on_delete=models.CASCADE)
    food = models.ForeignKey(Food, related_name="allowed_in", on_delete=models.PROTECT)
    amount = models.FloatField(
        null=True, blank=True, validators=[validate_positive, MaxValueValidator(_MAX_QUANTITY)]
    )
    notes = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        # A food is either on the list or it isn't — listing it twice is
        # always a slip, so the database refuses it as well as the API.
        constraints = [
            models.UniqueConstraint(fields=["plan", "food"], name="unique_allowed_food_per_plan")
        ]

    def __str__(self):
        return f"{self.plan.name}: {self.food.name}"
