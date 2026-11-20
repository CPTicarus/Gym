"""Retag already-uploaded .gif files as the new GIF media type.

Before this, every image extension collapsed to `image`, so existing GIFs
are sitting in the DB mislabelled. They rendered fine (a GIF is an image
as far as an <img> tag cares) — this is only so the media list shows them
for what they are.
"""
from django.db import migrations


def tag_gifs(apps, schema_editor):
    MoveMedia = apps.get_model("moves", "MoveMedia")
    MoveMedia.objects.filter(file__iendswith=".gif").update(media_type="gif")


def untag_gifs(apps, schema_editor):
    MoveMedia = apps.get_model("moves", "MoveMedia")
    MoveMedia.objects.filter(media_type="gif").update(media_type="image")


class Migration(migrations.Migration):

    dependencies = [
        ("moves", "0005_alter_movemedia_media_type"),
    ]

    operations = [
        migrations.RunPython(tag_gifs, untag_gifs),
    ]
