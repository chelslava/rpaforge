"""RPAForge Notifications Library - webhooks and email delivery."""

from __future__ import annotations

import logging
from typing import Any

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge_libraries.i18n import _
from rpaforge_libraries.Notifications.smtp import (
    DEFAULT_SMTP_PORT_STARTTLS,
    SmtpTransport,
)
from rpaforge_libraries.Notifications.transports import resolve_secret_ref
from rpaforge_libraries.Notifications.webhook import (
    DEFAULT_BACKOFF_BASE,
    DEFAULT_MAX_RETRIES,
    DEFAULT_TIMEOUT_SECONDS,
    WebhookTransport,
)

logger = logging.getLogger("rpaforge.notifications")


@library(name="Notifications", category="Integrations", icon="🔔")
class Notifications:
    """Notification delivery library: generic webhooks and SMTP email.

    Transports implement NotificationTransport so Slack, Microsoft Teams and
    Graph adapters can be dropped in later. All results are plain JSON-safe
    dicts that safely cross the stateful subprocess boundary.
    """

    @activity(name="Notify", category="Notifications")
    @tags("notify", "webhook", "http", "slack", "teams", "post")
    @output("Dictionary with status, attempts and HTTP status code")
    @param(
        "webhook_url",
        type="secret",
        description="Absolute http(s) webhook endpoint (treated as a secret).",
    )
    @param("message", type="string", description="Notification text to deliver.")
    @param("payload", type="dict", description="Optional extra JSON body fields.")
    @param("timeout", type="integer", description="Per-request timeout in seconds.")
    @param("max_retries", type="integer", description="Extra attempts after failure.")
    @param(
        "backoff_base",
        type="float",
        description="Base retry delay in seconds; doubles on every retry.",
    )
    def notify(
        self,
        webhook_url: str,
        message: str,
        payload: dict[str, Any] | None = None,
        timeout: int | float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_base: float = DEFAULT_BACKOFF_BASE,
    ) -> dict[str, Any]:
        """Deliver ``message`` to an HTTP webhook as a JSON POST body.

        Non-2xx responses and network errors are retried with exponential
        backoff; exhaustion raises WebhookDeliveryError. The URL never
        appears in logs.

        :param webhook_url: Absolute http(s) endpoint (treated as a secret).
        :param message: Human-readable notification text.
        :param payload: Optional extra fields merged into the JSON body.
        :param timeout: Per-request timeout in seconds.
        :param max_retries: Extra delivery attempts after the first one.
        :param backoff_base: Base delay between retries in seconds.
        :returns: Dict with status, attempts and status_code.
        :raises rpaforge_libraries.Notifications.transports.WebhookDeliveryError:
            When all delivery attempts fail.
        """
        transport = WebhookTransport(
            webhook_url,
            timeout=timeout,
            max_retries=max_retries,
            backoff_base=backoff_base,
        )
        result = transport.send(message, payload)
        logger.info(_("Notify completed with {status}.", status=result["status"]))
        return result

    @activity(name="Send Email", category="Notifications")
    @tags("notify", "email", "smtp", "mail", "attachment")
    @output("Dictionary with status, recipients, attachment count and TLS mode")
    @param("smtp_host", type="string", description="SMTP server hostname.")
    @param("port", type="integer", description="SMTP server port.")
    @param(
        "username_secret",
        type="secret",
        description=(
            "SMTP username, either plain or a secret reference "
            "(<provider>://<namespace>/<key>)."
        ),
    )
    @param(
        "password_secret_ref",
        type="secret",
        description=(
            "Mandatory secret reference to the SMTP password "
            "(<provider>://<namespace>/<key>). Inline passwords are rejected."
        ),
    )
    @param("to", type="list", description="Recipient address(es).")
    @param("subject", type="string", description="Email subject.")
    @param("body", type="code", description="Plain-text email body.")
    @param("attachments", type="list", description="Optional file paths to attach.")
    @param(
        "use_tls",
        type="boolean",
        description="Upgrade the connection using STARTTLS.",
    )
    @param(
        "use_ssl",
        type="boolean",
        description="Use implicit TLS (SMTP_SSL); mutually exclusive with use_tls.",
    )
    def send_email(
        self,
        smtp_host: str,
        port: int = DEFAULT_SMTP_PORT_STARTTLS,
        username_secret: str = "",
        password_secret_ref: str = "",
        to: str | list[str] = "",
        subject: str = "",
        body: str = "",
        attachments: list[str] | None = None,
        use_tls: bool = True,
        use_ssl: bool = False,
        timeout: int | float = 30.0,
    ) -> dict[str, Any]:
        """Send an email through SMTP with STARTTLS or implicit TLS.

        The password is resolved ONLY through a Credentials SecretProvider
        reference; inline passwords raise InlinePasswordRejected by design.
        The username may be a plain value or a secret reference.

        :param smtp_host: SMTP server hostname.
        :param port: SMTP server port.
        :param username_secret: Username or secret reference for it.
        :param password_secret_ref: Secret reference to the password.
        :param to: One recipient or a list of recipient addresses.
        :param subject: Email subject line.
        :param body: Plain-text body.
        :param attachments: Optional file paths to attach.
        :param use_tls: Negotiate STARTTLS after connecting (default).
        :param use_ssl: Connect over implicit TLS instead of STARTTLS.
        :param timeout: Socket timeout in seconds.
        :returns: Dict with status, host, port, recipients, attachments, tls.
        :raises rpaforge_libraries.Notifications.transports.InlinePasswordRejected:
            When the password is not a valid secret reference.
        :raises rpaforge_libraries.Notifications.transports.EmailDeliveryError:
            When the SMTP conversation fails.
        """
        username = ""
        password = ""
        if username_secret or password_secret_ref:
            username = resolve_secret_ref(
                username_secret, allow_plain=True, field="username"
            )
            password = resolve_secret_ref(
                password_secret_ref, allow_plain=False, field="password"
            )
        transport = SmtpTransport(
            smtp_host,
            port=port,
            username=username,
            password=password,
            use_tls=use_tls,
            use_ssl=use_ssl,
            timeout=timeout,
        )
        result = transport.send_email(
            to=to,
            subject=subject,
            body=body,
            attachments=attachments,
        )
        logger.info(
            _("Email notification completed with {status}.", status=result["status"])
        )
        return result
