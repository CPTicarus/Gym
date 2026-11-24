import apps.accounts.models
import apps.chat.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ChatMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.TextField(blank=True, max_length=5000)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='member_chat_messages', to=settings.AUTH_USER_MODEL)),
                ('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_chat_messages', to=settings.AUTH_USER_MODEL)),
                ('trainer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='trainer_chat_messages', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='ChatAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(blank=True, storage=apps.accounts.models.get_private_media_storage, upload_to=apps.chat.models.attachment_path)),
                ('name', models.CharField(max_length=255)),
                ('content_type', models.CharField(max_length=127)),
                ('size', models.PositiveIntegerField()),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('message', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='chat.chatmessage')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.AddIndex(
            model_name='chatmessage',
            index=models.Index(fields=['member', 'trainer', 'id'], name='chat_message_thread_idx'),
        ),
        migrations.AddConstraint(
            model_name='chatmessage',
            constraint=models.CheckConstraint(condition=models.Q(('sender', models.F('member')), ('sender', models.F('trainer')), _connector='OR'), name='chat_message_sender_is_participant'),
        ),
    ]
