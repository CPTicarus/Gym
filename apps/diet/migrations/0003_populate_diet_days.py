from django.db import migrations


def populate_diet_days(apps, schema_editor):
    """Diet plans used to have one flat set of meals that implicitly meant
    'every day'. Now each plan has 7 independent days, so for every
    existing plan: create all 7 days, keep each existing meal (and its
    items) on Saturday (day 0) as-is, and clone it onto the other six —
    preserving the old "same meals every day" behavior under the new
    per-day model instead of silently dropping six days' worth of data."""
    DietPlan = apps.get_model("diet", "DietPlan")
    DietDay = apps.get_model("diet", "DietDay")
    Meal = apps.get_model("diet", "Meal")
    DietItem = apps.get_model("diet", "DietItem")

    for plan in DietPlan.objects.all():
        days = {value: DietDay.objects.create(plan=plan, day_of_week=value) for value in range(7)}

        for meal in list(Meal.objects.filter(plan=plan)):
            items = list(meal.items.all())
            for day_value, day in days.items():
                if day_value == 0:
                    meal.day = day
                    meal.save(update_fields=["day"])
                    continue
                # `plan` is still a required FK at this point in the
                # migration history (dropped in 0004) — set it too so the
                # NOT NULL constraint doesn't reject the clone.
                clone = Meal.objects.create(plan=plan, day=day, name=meal.name, time=meal.time, order=meal.order)
                for item in items:
                    DietItem.objects.create(
                        meal=clone,
                        food_name=item.food_name,
                        quantity=item.quantity,
                        calories=item.calories,
                        protein_g=item.protein_g,
                        carbs_g=item.carbs_g,
                        fat_g=item.fat_g,
                        notes=item.notes,
                        order=item.order,
                    )


def noop_reverse(apps, schema_editor):
    # Irreversible by design — collapsing 7 days back into one flat list
    # would be lossy no matter how it's done.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("diet", "0002_dietday_meal_day"),
    ]

    operations = [
        migrations.RunPython(populate_diet_days, noop_reverse),
    ]
