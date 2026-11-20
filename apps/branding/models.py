from django.db import models


class GymBranding(models.Model):
    """Only administrator overrides are stored. The bundled design supplies the defaults."""

    overrides = models.JSONField(default=dict)

    @classmethod
    def current(cls):
        return cls.objects.filter(pk=1).values_list("overrides", flat=True).first() or {}
