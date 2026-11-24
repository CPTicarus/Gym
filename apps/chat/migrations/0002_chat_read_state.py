from itertools import islice

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def initialize_existing_read_states(apps, schema_editor):
    ChatMessage = apps.get_model('chat', 'ChatMessage')
    ChatReadState = apps.get_model('chat', 'ChatReadState')
    database = schema_editor.connection.alias
    threads = ChatMessage.objects.using(database).values_list('member_id', 'trainer_id').annotate(
        latest_id=models.Max('id'),
    ).iterator(chunk_size=500)
    # Start unread tracking after existing history, which has no read status.
    while batch := list(islice(threads, 500)):
        ChatReadState.objects.using(database).bulk_create([
            ChatReadState(
                member_id=member_id,
                trainer_id=trainer_id,
                member_read_through=latest_id,
                trainer_read_through=latest_id,
            ) for member_id, trainer_id, latest_id in batch
        ])


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ChatReadState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('member_read_through', models.PositiveBigIntegerField(default=0)),
                ('trainer_read_through', models.PositiveBigIntegerField(default=0)),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='member_chat_read_states', to=settings.AUTH_USER_MODEL)),
                ('trainer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='trainer_chat_read_states', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('member', 'trainer'), name='chat_read_state_per_thread')],
            },
        ),
        migrations.RunPython(initialize_existing_read_states, migrations.RunPython.noop),
    ]
