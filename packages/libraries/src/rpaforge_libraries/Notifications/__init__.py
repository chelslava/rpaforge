"""RPAForge Notifications Library.

Transport-abstracted notification delivery: generic HTTP webhooks and SMTP
email, with typed errors and secret masking built in.
"""

from rpaforge_libraries.Notifications.library import Notifications
from rpaforge_libraries.Notifications.smtp import SmtpTransport
from rpaforge_libraries.Notifications.transports import (
    EmailDeliveryError,
    InlinePasswordRejected,
    NotificationError,
    NotificationTransport,
    WebhookDeliveryError,
)
from rpaforge_libraries.Notifications.webhook import WebhookTransport

__all__ = [
    "EmailDeliveryError",
    "InlinePasswordRejected",
    "NotificationError",
    "NotificationTransport",
    "Notifications",
    "SmtpTransport",
    "WebhookDeliveryError",
    "WebhookTransport",
]
