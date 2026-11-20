import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("diet", "0003_populate_diet_days"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="meal",
            name="plan",
        ),
        migrations.AlterField(
            model_name="meal",
            name="day",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="meals", to="diet.dietday"
            ),
        ),
    ]
