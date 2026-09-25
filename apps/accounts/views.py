import mimetypes

from django.contrib.auth import get_user_model
from django.http import FileResponse, Http404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import BodyMeasurement, BodyPhoto, BodyPhotoExample, HealthCondition
from .permissions import (
    CanManageUser,
    IsAdmin,
    IsAdminOrAccounting,
    IsStaff,
    IsTrainerOrAdmin,
)
from .throttling import LoginRateThrottle
from .serializers import (
    BodyMeasurementSerializer,
    BodyPhotoExampleSerializer,
    BodyPhotoSerializer,
    CustomTokenObtainPairSerializer,
    HealthConditionSerializer,
    MemberEditSerializer,
    MeSerializer,
    RegisterSerializer,
    SetPasswordSerializer,
    StaffCreateSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserSerializer,
)

User = get_user_model()


def stream_private_image(image, download_name, cache_control):
    """Send one image out of the private tree.

    Shared by the two views that read from PRIVATE_MEDIA_ROOT so the
    content type and the caching posture can't drift apart between them.
    FileResponse streams rather than reading the whole file into memory.
    """
    content_type = mimetypes.guess_type(image.name)[0] or "application/octet-stream"
    extension = image.name.rsplit(".", 1)[-1]
    response = FileResponse(image.open("rb"), content_type=content_type)
    response["Cache-Control"] = cache_control
    response["Content-Disposition"] = f'inline; filename="{download_name}.{extension}"'
    return response




class CustomTokenObtainPairView(TokenObtainPairView):
    """POST {username, password} -> {access, refresh}, with role baked into the token.

    Rate-limited per account. This is not optional decoration: member
    passwords are deliberately allowed to be short (a 4-digit PIN — see
    apps/accounts/passwords.py), and a short password is only as safe as
    the number of guesses an attacker gets. The limit turns 10,000
    combinations from seconds of scripted traffic into most of a day.
    See LoginRateThrottle for why it counts per username, not per IP.
    """

    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]


class RegisterView(generics.CreateAPIView):
    """Public self-registration — always creates a MEMBER account."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class StaffCreateView(generics.CreateAPIView):
    """Admin-only: create trainer / admin / accounting accounts."""

    queryset = User.objects.all()
    serializer_class = StaffCreateSerializer
    permission_classes = [IsAdmin]


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH the logged-in user's own profile."""

    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class UserViewSet(viewsets.ModelViewSet):
    """
    The staff dashboard's user directory. Every staff role can reach it,
    but sees and can do different things:

      READ   admin: every user, any role
             trainer / accounting: members only (their clients / billing scope)
      CREATE admin, accounting — front-desk member intake (always creates a
             MEMBER; staff accounts go through POST /auth/staff/ instead)
      UPDATE admin: full profile, role, membership, active flag — for
             anyone except another admin (themselves included, so an admin
             can still edit their own record)
             accounting: members only, everything but role and active flag
             (see MemberEditSerializer)
             trainer: not allowed — read-only
             The per-object half of that lives in can_manage_user.

      POST /api/users/{id}/set-password/   {"password": "..."} — same rule
             as UPDATE. Sets a new password; nobody can read the existing
             one, here or anywhere else (it's a one-way hash).

      GET /api/users/?role=trainer   meaningful for admin; others are already scoped to members
      GET /api/users/?search=jane

    Deliberately no DELETE: removing a user would cascade into their workout
    and diet assignments and lose history. Deactivate via `is_active` instead.
    """

    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["role", "is_active"]
    search_fields = [
        "username", "national_id", "email", "first_name", "last_name", "phone_number",
    ]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if user.is_gym_admin:
            return User.objects.all()
        return User.objects.filter(role=User.Role.MEMBER)

    def get_permissions(self):
        # This override is the authority on permissions for the whole
        # viewset — it ignores self.permission_classes, which also means it
        # ignores any permission_classes set on an @action decorator. Any
        # action needing something other than IsStaff has to say so HERE or
        # it silently falls through to the IsStaff default below.
        if self.action == "body_photos":
            return [IsTrainerOrAdmin()]
        if self.action in ("create", "partial_update", "update", "set_password"):
            # IsAdminOrAccounting is the coarse gate (who may write at all);
            # CanManageUser is the per-record one (whose record they may
            # touch), and only the second can see the target.
            return [IsAdminOrAccounting(), CanManageUser()]
        return [IsStaff()]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("partial_update", "update"):
            # Admin edits everything including role; accounting edits a
            # member's details but can't touch role or the active flag.
            return UserAdminSerializer if self.request.user.is_gym_admin else MemberEditSerializer
        return UserSerializer

    def perform_create(self, serializer):
        """Accounting runs the front desk, so it can sign up members — but
        handing out trainer or admin accounts is the admin's call alone.
        Enforced here rather than in the serializer, since it's a question
        about the requester, not about the data."""
        role = serializer.validated_data.get("role", User.Role.MEMBER)
        if role != User.Role.MEMBER and not self.request.user.is_gym_admin:
            raise PermissionDenied("Only admins can create staff accounts.")
        serializer.save()

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        """Give someone a new password.

        Deliberately a set, not a reveal. Django stores passwords as a
        one-way hash, so the current one cannot be shown to staff, to an
        admin, or to anyone else — it can only be replaced. What the front
        desk needs (getting a locked-out member back in) this covers; the
        new value is the one the caller just supplied, so the person who
        set it already knows what to tell them.
        """
        target = self.get_object()  # runs CanManageUser against this record
        serializer = SetPasswordSerializer(
            data=request.data, context={"request": request, "target": target}
        )
        serializer.is_valid(raise_exception=True)
        target.set_password(serializer.validated_data["password"])
        target.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="body-photos")
    def body_photos(self, request, pk=None):
        """This member's front / side / back photos, and any extras, for
        writing a plan.

          GET /api/users/{id}/body-photos/

        The rest of this viewset is IsStaff, which includes accounting --
        they run the front desk and need member records to do it. They have
        no business looking at anyone's body, so this action is narrowed to
        trainers and admins in get_permissions() above. It has to be done
        there and not with permission_classes on the decorator: the
        get_permissions() override never consults those, so a decorator
        argument here would look right and do nothing.

        Members never reach this at all; they use /api/me/body-photos/.
        """
        member = self.get_object()
        photos = BodyPhoto.objects.filter(user=member)
        return Response(
            BodyPhotoSerializer(photos, many=True, context={"request": request}).data
        )


class BodyMeasurementViewSet(viewsets.ModelViewSet):
    """A member's own numbers — self-service only, so what's recorded is
    always what the person themselves reported.

      GET    /api/me/measurements/          (most recent first)
      POST   /api/me/measurements/          {"weight_kg": 82.5, "waist_cm": 88, "hips_cm": 102}
      PATCH  /api/me/measurements/{id}/
      DELETE /api/me/measurements/{id}/

    Staff read these indirectly, through the derived numbers on a user's
    profile (latest weight, waist, hips, WHR, BMI) rather than the log.
    """

    serializer_class = BodyMeasurementSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # select_related because each row's whtr reads user.height_cm —
        # without it, serializing a history is a query per entry.
        return BodyMeasurement.objects.filter(user=self.request.user).select_related("user")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class HealthConditionViewSet(viewsets.ModelViewSet):
    """A member's own flagged health problems.

      GET    /api/me/health-conditions/
      POST   /api/me/health-conditions/     {"condition": "knee_pain", "notes": "left, since 2024"}
      PATCH  /api/me/health-conditions/{id}/
      DELETE /api/me/health-conditions/{id}/

    Self-service, like measurements: a trainer needs to know about a bad
    knee, but it's the member's own health record and only they write it.
    Staff read it nested on the user profile (see UserSerializer).
    """

    serializer_class = HealthConditionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return HealthCondition.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class BodyPhotoViewSet(viewsets.ModelViewSet):
    """A member's own front / side / back photos, and any extras.

      GET    /api/me/body-photos/
      POST   /api/me/body-photos/       multipart: pose=front, image=<file>
                                        or pose=extra, image=<file> (+ note)
      PATCH  /api/me/body-photos/{id}/  multipart: image and/or note
      DELETE /api/me/body-photos/{id}/

    Self-service, like measurements and health conditions: a trainer needs
    to see these to write a sensible programme, but they are pictures of
    the member's body and only the member puts them there or takes them
    down. POSTing a main pose that already exists replaces it; POSTing an
    extra adds one, up to BodyPhoto.MAX_EXTRAS, and PATCH is how an extra
    gets replaced (see BodyPhotoSerializer).

    Staff read them through /api/users/{id}/body-photos/, which is
    restricted to trainers and admins -- deliberately NOT the IsStaff that
    guards the rest of the directory, since accounting runs the front desk
    and has no reason to see anyone's body.
    """

    serializer_class = BodyPhotoSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return BodyPhoto.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class BodyPhotoFileView(APIView):
    """Streams one body photo to someone allowed to see it.

      GET /api/body-photos/{id}/file/

    This view is the ONLY way to read these bytes. They are stored outside
    MEDIA_ROOT precisely so that no static handler will serve them, which
    means the check below is not one layer of several -- it is the layer.

    Who may look:
      - the member whose body it is
      - a trainer or an admin

    Not accounting, and not another member. A 404 rather than a 403 for
    everyone else: "this photo exists but you may not see it" is itself
    something worth not saying.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        photo = get_object_or_404(BodyPhoto, pk=pk)
        viewer = request.user
        may_view = (
            photo.user_id == viewer.id or viewer.is_trainer or viewer.is_gym_admin
        )
        if not may_view:
            raise Http404
        if not photo.image:
            raise Http404
        # no-store: nothing keeps a copy of someone's body photo lying
        # around in a shared proxy or a browser cache. A main pose is named
        # after itself; extras by id, or a trainer saving three of them
        # gets three files called extra.jpg.
        name = f"extra-{photo.pk}" if photo.pose == BodyPhoto.Pose.EXTRA else photo.pose
        return stream_private_image(photo.image, name, cache_control="private, max-age=0, no-store")


class BodyPhotoExampleViewSet(viewsets.ModelViewSet):
    """The gym's demonstration photos — what a good front/side/back shot
    looks like, posed by a trainer.

      GET    /api/body-photo-examples/            any signed-in user
      GET    /api/body-photo-examples/{id}/file/  any signed-in user
      POST   /api/body-photo-examples/            trainer/admin, multipart
      DELETE /api/body-photo-examples/{id}/       trainer/admin

    Members read these (they're the instructions for their own upload);
    only trainers and admins set them. Posting a pose that already has an
    example replaces it — see BodyPhotoExampleSerializer.create.
    """

    serializer_class = BodyPhotoExampleSerializer
    queryset = BodyPhotoExample.objects.all()
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    # Reading is open to any signed-in user; everything else is staff.
    READ_ACTIONS = ("list", "retrieve", "file")

    def get_permissions(self):
        # Written to fail CLOSED: anything not named here needs
        # trainer/admin. An action added later without a thought about
        # permissions ends up too strict, which someone notices, rather
        # than too loose, which nobody does.
        if self.action in self.READ_ACTIONS:
            return [permissions.IsAuthenticated()]
        return [IsTrainerOrAdmin()]

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request, pk=None):
        """The example image itself.

        Cached briefly, unlike a member's own photo: this is the same
        picture for every member in the gym and carries none of the
        per-person sensitivity, so re-fetching it on every page view is
        pure waste. Still `private` and still behind a login — it is a
        photograph of a trainer's body, not a logo.
        """
        example = self.get_object()
        if not example.image:
            raise Http404
        return stream_private_image(
            example.image, f"example-{example.pose}", cache_control="private, max-age=600"
        )
