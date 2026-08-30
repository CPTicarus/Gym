from django.contrib import admin

from .models import Move, MoveMedia


class MoveMediaInline(admin.TabularInline):
    model = MoveMedia
    extra = 1


@admin.register(Move)
class MoveAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "difficulty", "created_by", "created_at"]
    list_filter = ["category", "difficulty"]
    search_fields = ["name", "description"]
    inlines = [MoveMediaInline]
