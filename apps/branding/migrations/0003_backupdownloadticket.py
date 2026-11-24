import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('branding', '0002_gymbranding_chat_media_max_size_mb_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='BackupDownloadTicket',
            fields=[
                ('digest', models.CharField(editable=False, max_length=64, primary_key=True, serialize=False)),
                ('kind', models.CharField(max_length=8)),
                ('file_name', models.CharField(max_length=64)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
