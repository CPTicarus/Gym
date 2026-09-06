from django.contrib import admin

from .models import Post


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ["title", "category", "status", "author", "published_at"]
    list_filter = ["status", "category"]
    search_fields = ["title", "summary", "content"]
    readonly_fields = ["published_at", "created_at", "updated_at"]
