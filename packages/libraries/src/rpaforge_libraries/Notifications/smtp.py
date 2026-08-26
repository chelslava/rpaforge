"""SMTP email transport (stdlib ``smtplib`` + ``ssl`` only).

Passwords are never accepted inline: they must already be resolved through a
Credentials SecretProvider reference by the caller. Supports implicit TLS
(``SMTP_SSL``) and STARTTLS on a plain connection. All SMTP failures are
wrapped in :class:`~rpaforge_libraries.Notifications.transports.EmailDeliveryError`,
mirroring the webhook adapter's typed error contract.
"""

from __future__ import annotations

import logging
import mimetypes
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from rpaforge_libraries.i18n import _
from rpaforge_libraries.Notifications.transports import EmailDeliveryError

logger = logging.getLogger("rpaforge.notifications")

DEFAULT_SMTP_PORT_STARTTLS = 587
DEFAULT_SMTP_PORT_SSL = 465


def _guess_mime(filename: str) -> tuple[str, str]:
    """Guess ``(maintype, subtype)`` for an attachment filename."""
    guessed, _ = mimetypes.guess_type(filename)
    if guessed and "/" in guessed:
        return tuple(guessed.split("/", 1))  # type: ignore[return-value]
    return ("application", "octet-stream")


class SmtpTransport:
    """SMTP adapter implementing NotificationTransport for email delivery."""

    def __init__(
        self,
        host: str,
        port: int = DEFAULT_SMTP_PORT_STARTTLS,
        username: str = "",
        password: str = "",
        *,
        use_tls: bool = True,
        use_ssl: bool = False,
        timeout: float = 30.0,
    ) -> None:
        """Create an SMTP transport.

        :param host: SMTP server hostname.
        :param port: SMTP server port.
        :param username: Username (already resolved; may be empty).
        :param password: Password (already resolved through a secret ref).
        :param use_tls: Upgrade the connection with STARTTLS.
        :param use_ssl: Use implicit TLS via ``SMTP_SSL`` (mutually exclusive
            with ``use_tls``).
        :param timeout: Socket timeout in seconds.
        """
        if not host or not host.strip():
            raise ValueError("SMTP host must be a non-empty string.")
        if use_tls and use_ssl:
            raise ValueError(
                "use_tls (STARTTLS) and use_ssl (implicit TLS) are mutually exclusive."
            )
        if password and not username:
            raise ValueError("SMTP username is required when a password is provided.")
        self._host = host.strip()
        self._port = int(port)
        self._username = username.strip()
        self._password = password
        self._use_tls = bool(use_tls)
        self._use_ssl = bool(use_ssl)
        self._timeout = max(0.1, float(timeout))

    @property
    def tls_mode(self) -> str:
        """Human-readable TLS mode used for this transport."""
        if self._use_ssl:
            return "ssl"
        return "starttls" if self._use_tls else "none"

    def send(
        self, message: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Send an email. ``payload`` keys: to, subject, body, attachments, from.

        Provided to satisfy NotificationTransport; prefer :meth:`send_email`.
        """
        data = dict(payload or {})
        return self.send_email(
            to=data.get("to", ""),
            subject=str(data.get("subject", "")),
            body=str(data.get("body", message)),
            attachments=data.get("attachments"),
            from_addr=str(data.get("from", "")) or None,
        )

    def send_email(
        self,
        to: str | list[str],
        subject: str,
        body: str,
        attachments: list[str] | None = None,
        from_addr: str | None = None,
    ) -> dict[str, Any]:
        """Compose and send an email message.

        :param to: One recipient or list of recipient addresses.
        :param subject: Email subject line.
        :param body: Plain-text email body.
        :param attachments: Optional list of file paths to attach.
        :param from_addr: Optional sender address; defaults to the username
            when it looks like an email, otherwise derived from the host.
        :returns: Summary dict with status, recipients, attachment count and
            the TLS mode used.
        :raises EmailDeliveryError: When the SMTP conversation fails.
        """
        recipients = _as_recipient_list(to)
        if not recipients:
            raise ValueError("At least one recipient address is required.")
        sender = from_addr or (
            self._username if "@" in self._username else f"rpaforge@{self._host}"
        )
        mime_message = self._build_message(
            sender, recipients, subject, body, attachments
        )

        client: smtplib.SMTP | smtplib.SMTP_SSL
        if self._use_ssl:
            context = ssl.create_default_context()
            logger.info(
                _(
                    "Connecting to {host}:{port} over implicit TLS.",
                    host=self._host,
                    port=self._port,
                )
            )
            client = smtplib.SMTP_SSL(
                self._host,
                self._port,
                context=context,
                timeout=self._timeout,
            )
        else:
            logger.info(
                _("Connecting to {host}:{port}.", host=self._host, port=self._port)
            )
            client = smtplib.SMTP(self._host, self._port, timeout=self._timeout)

        try:
            with client:
                if self._use_tls and not self._use_ssl:
                    context = ssl.create_default_context()
                    client.starttls(context=context)
                    logger.info(_("STARTTLS negotiated with {host}.", host=self._host))
                if self._username:
                    client.login(self._username, self._password)
                refusal = client.sendmail(sender, recipients, mime_message.as_string())
        except smtplib.SMTPRecipientsRefused as exc:
            refused = sorted(str(address) for address in exc.recipients)
            logger.error(_("SMTP rejected all recipients via {host}.", host=self._host))
            raise EmailDeliveryError(
                _(
                    "Email delivery via {host}:{port} failed: all recipients "
                    "rejected ({refused}).",
                    host=self._host,
                    port=self._port,
                    refused=", ".join(refused),
                )
            ) from exc
        except smtplib.SMTPException as exc:
            logger.error(_("SMTP delivery via {host} failed.", host=self._host))
            raise EmailDeliveryError(
                _(
                    "Email delivery via {host}:{port} failed: {error}",
                    host=self._host,
                    port=self._port,
                    error=type(exc).__name__,
                )
            ) from exc
        except OSError as exc:
            raise EmailDeliveryError(
                _(
                    "Connection to {host}:{port} failed: {reason}",
                    host=self._host,
                    port=self._port,
                    reason=exc.__class__.__name__,
                )
            ) from exc

        if refusal:
            raise EmailDeliveryError(
                _(
                    "Email delivery via {host}:{port} partially failed: "
                    "{count} recipient(s) refused.",
                    host=self._host,
                    port=self._port,
                    count=len(refusal),
                )
            )

        result: dict[str, Any] = {
            "status": "sent",
            "host": self._host,
            "port": self._port,
            "recipients": recipients,
            "attachments": len(attachments or []),
            "tls": self.tls_mode,
        }
        logger.info(
            _(
                "Email sent to {count} recipient(s) via {host} ({mode}).",
                count=len(recipients),
                host=self._host,
                mode=self.tls_mode,
            )
        )
        return result

    def _build_message(
        self,
        sender: str,
        recipients: list[str],
        subject: str,
        body: str,
        attachments: list[str] | None,
    ) -> EmailMessage:
        """Build the MIME message with optional file attachments."""
        message = EmailMessage()
        message["From"] = sender
        message["To"] = ", ".join(recipients)
        message["Subject"] = subject
        message.set_content(body)
        for path in attachments or []:
            file_path = Path(path)
            if not file_path.is_file():
                raise FileNotFoundError(f"Attachment file not found: '{path}'")
            maintype, subtype = _guess_mime(file_path.name)
            message.add_attachment(
                file_path.read_bytes(),
                maintype=maintype,
                subtype=subtype,
                filename=file_path.name,
            )
        return message


def _as_recipient_list(value: str | list[str]) -> list[str]:
    """Normalise a string / comma-separated string / list into addresses."""
    if isinstance(value, str):
        parts = value.split(",")
    else:
        parts = []
        for item in value:
            parts.extend(str(item).split(","))
    return [part.strip() for part in parts if part.strip()]
