from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class MemberAccountingSerializer(serializers.ModelSerializer):
    """
    Full member detail for accounting: everything on the User record plus
    the membership window and a computed `is_membership_active` flag, so
    accounting doesn't have to compute "are they still active" themselves.

    Read-only by design — per the brief, accounting just needs to *see*
    this data. If you later want accounting to extend/renew a membership
    directly instead of going through an admin, this serializer is the
    place to add `membership_end_date` as writable and switch the
    viewset from ReadOnlyModelViewSet to a normal ModelViewSet.
    """

    is_membership_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "role",
            "phone_number", "date_of_birth", "gender",
            "membership_start_date", "membership_end_date", "is_membership_active",
            "is_active", "date_joined", "created_at",
        ]
        read_only_fields = fields
