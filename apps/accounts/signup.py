"""The two ways a gym can take on members, and what differs between them.

A gym runs exactly one, set by MEMBER_SIGNUP (settings/base.py):

  staff  The front desk creates every member account (UserViewSet), and
         the public sign-up endpoint is closed. The default.
  self   People sign themselves up (RegisterView) and enter their own
         measurements, and a trainer assigns them a plan. They can't open
         that plan -- or any other -- until they've paid (User.plans_locked).

Everything else is the same in both, and should stay that way: the mode is
read here and by the few places that import from here (sign-up, the plan
lock, and what the frontend is told through PublicConfigView), never inside
features like the plan builder.

"Paid" means an active membership window for now. Staff record a payment
the way they always have -- "+30 days" on the member's page -- and an online
payment, once there is one, should call User.extend_membership rather than
invent a second idea of what having paid means.
"""
from django.conf import settings


def self_signup_enabled():
    return settings.MEMBER_SIGNUP == "self"
