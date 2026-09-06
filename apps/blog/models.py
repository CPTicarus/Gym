from django.conf import settings
from django.db import models
from django.db.models import F
from django.utils import timezone


class Post(models.Model):
    """An article written by a trainer or admin — training tips, nutrition
    notes, gym announcements — that every member can read.

    Unlike plans, a post isn't assigned to anyone: it's published once and
    visible to the whole gym. Drafts stay private to their author (and
    admins) until the status flips to published, so a half-written post
    can be saved without members seeing it.
    """

    class Category(models.TextChoices):
        TRAINING = "training", "Training"
        NUTRITION = "nutrition", "Nutrition"
        NEWS = "news", "Gym News"
        HEALTH = "health", "Health"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, blank=True)
    content = models.TextField()
    category = models.CharField(max_length=20, choices=Category.choices, blank=True)
    cover_image = models.ImageField(upload_to="blog/", null=True, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="blog_posts",
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Newest published first. Drafts (published_at is NULL) sit at the
        # top for the only people who can see them — their author and
        # admins — since those are the posts still needing work. nulls_first
        # is spelled out because SQLite and Postgres disagree on where NULLs
        # land by default.
        ordering = [F("published_at").desc(nulls_first=True), "-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # Stamp the publish date the first time a post actually goes live,
        # and only then — editing a published post later shouldn't bump it
        # back to the top of the feed. Here rather than in the serializer so
        # publishing from the Django admin behaves the same way.
        if self.status == self.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)
