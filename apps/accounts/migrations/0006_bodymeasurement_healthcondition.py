"""Widen the weight log into a body-measurement log, and add health flags.

Written by hand. `makemigrations` saw the rename as an unrelated
delete-then-create, which would have dropped every weight a member has
ever logged — the exact history the feature exists to show them.
RenameModel keeps the table and its rows.
"""
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_alter_user_gender"),
    ]

    operations = [
        # --- WeightLog -> BodyMeasurement, rows intact ---
        migrations.RenameModel(old_name="WeightLog", new_name="BodyMeasurement"),
        migrations.RemoveConstraint(
            model_name="bodymeasurement",
            name="unique_weight_log_per_user_per_day",
        ),
        migrations.AlterModelOptions(
            name="bodymeasurement",
            options={"ordering": ["-recorded_at", "-created_at"]},
        ),
        migrations.AlterField(
            model_name="bodymeasurement",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="measurements",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # Weight becomes optional: recording only a waist is a valid entry.
        migrations.AlterField(
            model_name="bodymeasurement",
            name="weight_kg",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bodymeasurement",
            name="waist_cm",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bodymeasurement",
            name="hips_cm",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="bodymeasurement",
            name="recorded_at",
            field=models.DateField(default=django.utils.timezone.localdate),
        ),
        migrations.AddConstraint(
            model_name="bodymeasurement",
            constraint=models.UniqueConstraint(
                fields=("user", "recorded_at"), name="unique_measurement_per_user_per_day"
            ),
        ),
        # --- health flags ---
        migrations.CreateModel(
            name="HealthCondition",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "condition",
                    models.CharField(
                        choices=[
                            ("back_pain", "Back pain"),
                            ("knee_pain", "Knee pain"),
                            ("shoulder_pain", "Shoulder pain"),
                            ("neck_pain", "Neck pain"),
                            ("wrist_pain", "Wrist pain"),
                            ("ankle_pain", "Ankle pain"),
                            ("hernia", "Hernia"),
                            ("asthma", "Asthma"),
                            ("heart_condition", "Heart condition"),
                            ("high_blood_pressure", "High blood pressure"),
                            ("diabetes", "Diabetes"),
                            ("recent_surgery", "Recent surgery"),
                            ("pregnancy", "Pregnancy"),
                            ("other", "Other"),
                        ],
                        max_length=30,
                    ),
                ),
                ("description", models.CharField(blank=True, max_length=100)),
                ("notes", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="health_conditions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["condition", "id"]},
        ),
        migrations.AddConstraint(
            model_name="healthcondition",
            constraint=models.UniqueConstraint(
                condition=models.Q(("condition", "other"), _negated=True),
                fields=("user", "condition"),
                name="unique_listed_condition_per_user",
            ),
        ),
    ]
