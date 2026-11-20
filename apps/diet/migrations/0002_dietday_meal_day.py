import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("diet", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="DietDay",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "day_of_week",
                    models.PositiveSmallIntegerField(
                        choices=[
                            (0, "Saturday"),
                            (1, "Sunday"),
                            (2, "Monday"),
                            (3, "Tuesday"),
                            (4, "Wednesday"),
                            (5, "Thursday"),
                            (6, "Friday"),
                        ]
                    ),
                ),
                (
                    "plan",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="days", to="diet.dietplan"
                    ),
                ),
            ],
            options={
                "ordering": ["day_of_week"],
            },
        ),
        migrations.AddConstraint(
            model_name="dietday",
            constraint=models.UniqueConstraint(fields=("plan", "day_of_week"), name="unique_diet_day_per_plan"),
        ),
        # Nullable for now — the data migration that follows populates it
        # from each meal's (still-present) `plan` FK before it's dropped.
        migrations.AddField(
            model_name="meal",
            name="day",
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.CASCADE, related_name="meals", to="diet.dietday"
            ),
        ),
    ]
