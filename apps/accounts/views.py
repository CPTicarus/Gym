import mimetypes

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.branding.models import GymBranding

from .models import BodyMeasurement, BodyPhoto, BodyPhotoExample, HealthCondition
from .permissions import (
    CanManageUser,
    IsAdmin,
    IsAdminOrAccounting,
    IsStaff,
    IsTrainer,
    IsTrainerOrAdmin,
    SelfSignupOpen,
    visible_members,
)
from .throttling import LoginRateThrottle, PasswordChangeRateThrottle, RegisterRateThrottle
from .serializers import (
    BodyMeasurementSerializer,
    BodyPhotoExampleSerializer,
    BodyPhotoSerializer,
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    ExtendMembershipSerializer,
    HealthConditionSerializer,
    MemberEditSerializer,
    MeSerializer,
    RegisterSerializer,
    SetPasswordSerializer,
    StaffCreateSerializer,
    TrainerSummarySerializer,
    UnassignedMemberSerializer,
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
    """Public self-registration — always creates a MEMBER account.

    Open only in a self sign-up gym (SelfSignupOpen); in the default,
    staff-managed one the front desk creates members and this answers 403.

    No authentication classes, on purpose. A stored token, stale or not,
    has nothing to do with signing up, and with nothing to authenticate
    against, a closed door reads as the 403 it is instead of a 401 asking
    for credentials.
    """

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    authentication_classes = []
    permission_classes = [SelfSignupOpen]
    throttle_classes = [RegisterRateThrottle]


def trainer_options():
    return User.available_trainers().order_by("first_name", "last_name", "pk")


class SignupTrainerListView(generics.ListAPIView):
    serializer_class = TrainerSummarySerializer
    authentication_classes = []
    permission_classes = [SelfSignupOpen]
    pagination_class = None

    def get_queryset(self):
        return trainer_options()


class PublicConfigView(APIView):
    """What the app needs to know about this gym before anyone signs in.

      GET /api/config/   Sign-up workflow and public branding overrides.

    MEMBER_SIGNUP is set in one place, here on the backend, which is also
    where it's enforced. The frontend asks instead of keeping its own copy,
    since two settings for one decision would sooner or later disagree.
    Public, because the login page is the first thing that needs it.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"member_signup": settings.MEMBER_SIGNUP, "branding": GymBranding.current()})


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
        if self.request.method in ("PATCH", "PUT"):
            return get_object_or_404(User.objects.select_for_update(), pk=self.request.user.pk)
        return self.request.user

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)


class ChangePasswordView(APIView):
    """The signed-in user changes their own password.

      POST /api/auth/change-password/   {"current_password": "...", "password": "..."}

    Any role. Needs the current password (see ChangePasswordSerializer) and
    is rate-limited per account (PasswordChangeRateThrottle). JWTs are
    stateless, so sessions already signed in — this one included — carry
    on until their tokens expire; what changes is what it takes to sign in
    next time.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [PasswordChangeRateThrottle]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["password"])
        request.user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSet(viewsets.ModelViewSet):
    """
    The staff dashboard's user directory. Every staff role can reach it,
    but sees and can do different things:

      READ   admin: every user, any role
             trainer: full profiles for their assigned members, names in the unassigned queue
             accounting: all members
      CREATE admin, accounting — front-desk member intake (always creates a
             MEMBER; staff accounts go through POST /auth/staff/ instead)
      UPDATE admin: full profile, role, membership, active flag — for
             anyone except another admin (themselves included, so an admin
             can still edit their own record)
             accounting: members only, everything but role and active flag
             (see MemberEditSerializer)
             trainer: can take on an unassigned member through POST /claim/
             The per-object half of that lives in can_manage_user.

      POST /api/users/{id}/set-password/   {"password": "..."} — same rule
             as UPDATE. Sets a new password; nobody can read the existing
             one, here or anywhere else (it's a one-way hash).

      POST /api/users/{id}/extend-membership/   {"days": 30} optional — same
             rule as UPDATE, members only. See User.extend_membership.

      GET /api/users/?role=trainer   meaningful for admin; others are already scoped to members
      GET /api/users/?search=jane
      GET /api/users/?waiting_for_plan=true   members with no active workout plan
      GET /api/users/?needs_trainer=true      admin queue for members without an active trainer
      GET /api/users/unassigned-members/     trainer queue with member names
      POST /api/users/{id}/claim/            assign an unassigned member to the signed-in trainer

    Deliberately no DELETE: removing a user would cascade into their workout
    and diet assignments and lose history. Deactivate via `is_active` instead.
    """

    permission_classes = [IsStaff]
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["role", "is_active"]
    search_fields = [
        "username", "national_id", "email", "first_name", "last_name", "phone_number",
    ]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if self.action == "unassigned_members":
            return (
                self.active_members().filter(trainer__isnull=True)
                .only("id", "first_name", "last_name").order_by("created_at", "pk")
            )
        user = self.request.user
        is_admin = getattr(user, "is_gym_admin", False)
        queryset = User.objects.all() if is_admin else visible_members(user)
        if self.action in ("partial_update", "update"):
            return queryset.select_for_update()
        queryset = queryset.select_related("trainer")
        if self.action == "list" and is_admin and self.request.query_params.get("needs_trainer") == "true":
            queryset = (
                queryset.filter(role=User.Role.MEMBER)
                .exclude(trainer__role=User.Role.TRAINER, trainer__is_active=True)
                .order_by("created_at", "id")
            )
        if self.action == "list" and self.request.query_params.get("waiting_for_plan") == "true":
            # Through the reverse relation's name rather than importing the
            # workouts app, which already depends on this one. `id` breaks
            # ties between sign-ups saved within the same clock tick.
            queryset = (
                queryset.filter(role=User.Role.MEMBER)
                .exclude(workout_assignments__status="active")
                .order_by("created_at", "id")
            )
        return queryset

    def get_permissions(self):
        # This override is the authority on permissions for the whole
        # viewset — it ignores self.permission_classes, which also means it
        # ignores any permission_classes set on an @action decorator. Any
        # action needing something other than IsStaff has to say so HERE or
        # it silently falls through to the IsStaff default below.
        if self.action == "body_photos":
            return [IsTrainerOrAdmin()]
        if self.action == "available_trainers":
            return [IsAdmin()]
        if self.action in ("unassigned_members", "claim"):
            return [IsTrainer()]
        if self.action in ("create", "partial_update", "update", "set_password", "extend_membership"):
            # IsAdminOrAccounting is the coarse gate (who may write at all);
            # CanManageUser is the per-record one (whose record they may
            # touch), and only the second can see the target.
            return [IsAdminOrAccounting(), CanManageUser()]
        return [IsStaff()]

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("partial_update", "update"):
            # Admin edits everything including role; accounting edits a
            # member's details but can't touch role or the active flag.
            return UserAdminSerializer if self.request.user.is_gym_admin else MemberEditSerializer
        return super().get_serializer_class()

    def perform_create(self, serializer):
        """Accounting runs the front desk, so it can sign up members — but
        handing out trainer or admin accounts is the admin's call alone.
        Enforced here rather than in the serializer, since it's a question
        about the requester, not about the data."""
        role = serializer.validated_data.get("role", User.Role.MEMBER)
        if role != User.Role.MEMBER and not self.request.user.is_gym_admin:
            raise PermissionDenied("Only admins can create staff accounts.")
        serializer.save()

    @action(detail=False, methods=["get"], url_path="available-trainers")
    def available_trainers(self, request):
        return Response(TrainerSummarySerializer(trainer_options(), many=True).data)

    @staticmethod
    def active_members():
        return User.objects.filter(role=User.Role.MEMBER, is_active=True)

    @action(
        detail=False,
        methods=["get"],
        url_path="unassigned-members",
        serializer_class=UnassignedMemberSerializer,
        filter_backends=[SearchFilter],
        search_fields=["first_name", "last_name"],
    )
    def unassigned_members(self, request):
        return self.list(request)

    @action(detail=True, methods=["post"])
    def claim(self, request, pk=None):
        trainer = request.user
        members = self.active_members()
        available = members.filter(Q(trainer__isnull=True) | Q(trainer=trainer))
        member = get_object_or_404(available.only("id"), pk=pk)
        # Only the first claimant can update the row. A repeated request
        # from the successful trainer can safely return the same result.
        claimed = members.filter(pk=member.pk, trainer__isnull=True).update(
            trainer=trainer, updated_at=timezone.now()
        )
        if not claimed and not members.filter(pk=member.pk, trainer=trainer).exists():
            raise Http404
        return Response(status=status.HTTP_204_NO_CONTENT)

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

    @action(detail=True, methods=["post"], url_path="extend-membership")
    def extend_membership(self, request, pk=None):
        """Add days to a member's membership — 30 unless the body says otherwise.

          POST /api/users/{id}/extend-membership/   {"days": 30} (optional)

        Same who-may rule as editing the record (admin, or accounting for a
        member). Where the new days count from is User.extend_membership's
        call. The row is locked for the update, so a double-click at the
        front desk adds 60 days on purpose or not at all — never 30 twice
        read off the same stale end date.
        """
        member = self.get_object()  # runs CanManageUser against this record
        if not member.is_member:
            raise ValidationError({"detail": "Only a member has a membership to extend."})
        serializer = ExtendMembershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            member = User.objects.select_for_update().get(pk=member.pk)
            member.extend_membership(serializer.validated_data["days"])
        return Response(self.get_serializer(member).data)

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
      - the member's assigned trainer or a gym admin

    Not accounting, and not another member. A 404 rather than a 403 for
    everyone else: "this photo exists but you may not see it" is itself
    something worth not saying.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        viewer = request.user
        photos = BodyPhoto.objects.all()
        if viewer.is_trainer:
            photos = photos.filter(Q(user=viewer) | Q(user__in=visible_members(viewer)))
        elif not viewer.is_gym_admin:
            photos = photos.filter(user=viewer)
        photo = get_object_or_404(photos, pk=pk)
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
