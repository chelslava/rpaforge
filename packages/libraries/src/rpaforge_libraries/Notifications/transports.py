"""Transport abstraction for notification delivery adapters.

Defines the :class:`NotificationTransport` protocol so Slack, Microsoft Teams,
Microsoft Graph and other delivery adapters can be added as drop-in
implementations later, plus typed errors and secret-reference resolution
helpers shared by all transports.
"""

from __future__ import annotations

import re
from typing import Any, Protocol, runtime_checkable

from rpaforge_libraries.Credentials.providers.base import SecretMasker
from rpaforge_libraries.Credentials.providers.factory import get_secret_provider
from rpaforge_libraries.i18n import _

SECRET_REF_RE = re.compile(
    r"^(?P<provider>[a-zA-Z][a-zA-Z0-9_-]*)://(?P<namespace>[^/\s]+)/(?P<key>.+)$"
)


class NotificationError(Exception):
    """Base class for notification delivery errors."""


class WebhookDeliveryError(NotificationError):
    """Raised when webhook delivery fails after all retry attempts."""


class EmailDeliveryError(NotificationError):
    """Raised when email delivery via SMTP fails."""


class InlinePasswordRejected(NotificationError, ValueError):
    """Raised when a raw inline password is passed instead of a secret ref.

    By design the email transport never accepts literal passwords: they must
    be provided as Credentials SecretProvider references. This class derives
    from both :class:`NotificationError` (typed error) and ``ValueError``
    (validation error) per the issue contract.
    """


@runtime_checkable
class NotificationTransport(Protocol):
    """Interface every notification adapter must implement.

    Implementations receive already-resolved credential values and must never
    log or embed them in returned summaries. Returns a plain JSON-safe dict
    describing the outcome so results survive the stateful subprocess
    boundary.
    """

    def send(
        self, message: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Deliver ``message`` (with optional structured ``payload``)."""


def register_secret(value: str) -> None:
    """Register a value with the global SecretMasker for log redaction."""
    if value:
        SecretMasker().register_secret(value)


def describe_url(url: str) -> str:
    """Return a log-safe URL description without path, query or fragment.

    Keeps any token embedded in the webhook URL out of logs even before the
    SecretMaskingFilter is attached.
    """
    match = re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#\s]+", url)
    return match.group(0) if match else "<redacted-url>"


def resolve_secret_ref(
    value: str,
    *,
    allow_plain: bool,
    field: str,
) -> str:
    """Resolve a ``<provider>://<namespace>/<key>`` reference to its secret.

    :param value: Raw parameter value, either a secret reference or a plain
        string (only when ``allow_plain`` is set).
    :param allow_plain: Whether non-reference values are accepted verbatim.
    :param field: Parameter name used in error messages.
    :returns: Resolved secret value.
    :raises InlinePasswordRejected: If ``allow_plain`` is false and the value
        is not a valid secret reference (inline passwords rejected by design).
    """
    text = (value or "").strip()
    match = SECRET_REF_RE.match(text)
    if not match:
        if allow_plain:
            return text
        raise InlinePasswordRejected(
            _(
                "{field} must be a secret reference of the form "
                "'<provider>://<namespace>/<key>' (e.g. 'env://default/SMTP_PASSWORD'). "
                "Inline passwords are rejected by design.",
                field=field,
            )
        )
    provider = get_secret_provider(match.group("provider").lower())
    resolved = provider.get_secret(
        match.group("key"), namespace=match.group("namespace")
    )
    register_secret(resolved)
    return resolved
