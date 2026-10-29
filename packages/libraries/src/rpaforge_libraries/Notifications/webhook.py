"""Generic HTTP webhook transport (stdlib ``urllib`` only).

Sends JSON POST requests with bounded exponential-backoff retries. Any
non-2xx response or network error triggers a retry; when all attempts are
exhausted a :class:`~rpaforge_libraries.Notifications.transports.WebhookDeliveryError`
is raised. The webhook URL is treated as a secret and never appears in logs.

SSRF guard (issue #825): by default the transport refuses to deliver to
private, loopback, link-local (incl. cloud metadata 169.254.169.254),
reserved, multicast and unspecified addresses — a crafted diagram must not
be able to probe or exfiltrate into the daemon's internal network. Hostnames
are resolved at send time and *all* resolved addresses must be public.
Set ``RPAFORGE_WEBHOOK_ALLOW_PRIVATE=1`` (or pass
``allow_private_addresses=True``) to lift the restriction for trusted,
isolated environments. Known limitation: the check runs immediately before
the request, so a hostile DNS server with short TTLs could still rebind
between check and connect; run the daemon in a network-restricted
environment (Docker network policies) when delivering untrusted workflows.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import socket
import time
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlparse

from rpaforge_libraries.Credentials.providers.base import SecretMasker
from rpaforge_libraries.i18n import _
from rpaforge_libraries.Notifications.transports import (
    WebhookDeliveryError,
    describe_url,
)

logger = logging.getLogger("rpaforge.notifications")

DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_RETRIES = 2
DEFAULT_BACKOFF_BASE = 0.5
BACKOFF_CAP_SECONDS = 30.0

#: Set to ``1``/``true``/``yes``/``on`` to allow delivery to private ranges.
ALLOW_PRIVATE_ENV = "RPAFORGE_WEBHOOK_ALLOW_PRIVATE"

_TRUTHY = ("1", "true", "yes", "on")


def allow_private_from_env() -> bool:
    """Whether ``RPAFORGE_WEBHOOK_ALLOW_PRIVATE`` enables private targets."""
    return os.environ.get(ALLOW_PRIVATE_ENV, "").strip().lower() in _TRUTHY


def _address_blocked(ip_text: str) -> bool:
    """True if the address is private/loopback/link-local/reserved/other-local."""
    try:
        address = ipaddress.ip_address(ip_text)
    except ValueError:
        return True  # unparseable resolver output is never trusted
    return bool(
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
    )


def resolve_blocked_address(hostname: str) -> str | None:
    """Resolve ``hostname`` and return a refusal reason, or None when public.

    All resolved addresses must be public; the first blocked one names the
    reason. DNS failure counts as blocked (fail closed).
    """
    try:
        infos = socket.getaddrinfo(hostname, None)
    except OSError as exc:
        return f"DNS resolution failed ({exc.__class__.__name__})"
    for info in infos:
        ip_text = str(info[4][0])
        if _address_blocked(ip_text):
            return f"resolves to non-public address {ip_text}"
    return None


def _backoff_delay(base: float, cap: float, failed_attempt: int) -> float:
    """Exponential backoff for the Nth failed attempt (1-based), capped."""
    return min(cap, base * (2 ** max(0, failed_attempt - 1)))


class WebhookTransport:
    """JSON-over-HTTP webhook adapter implementing NotificationTransport."""

    def __init__(
        self,
        url: str,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_base: float = DEFAULT_BACKOFF_BASE,
        headers: dict[str, str] | None = None,
        allow_private_addresses: bool | None = None,
    ) -> None:
        """Create a webhook transport.

        :param url: Absolute http(s) webhook endpoint. Treated as a secret.
        :param timeout: Per-request timeout in seconds.
        :param max_retries: Extra delivery attempts after the first one.
        :param backoff_base: Base delay in seconds; doubles each retry.
        :param headers: Optional extra HTTP headers.
        :param allow_private_addresses: Disable the SSRF denylist for this
            transport; defaults to the ``RPAFORGE_WEBHOOK_ALLOW_PRIVATE``
            environment variable (denylist active when unset).
        """
        if not isinstance(url, str) or not url.strip():
            raise ValueError("Webhook URL must be a non-empty string.")
        self._url = url.strip()
        parsed = urlparse(self._url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError(
                f"Invalid webhook URL '{describe_url(self._url)}': "
                "an absolute http(s) URL is required."
            )
        self._timeout = max(0.1, float(timeout))
        self._max_retries = max(0, int(max_retries))
        self._backoff_base = max(0.0, float(backoff_base))
        self._extra_headers = dict(headers or {})
        self._allow_private_addresses = (
            allow_private_from_env()
            if allow_private_addresses is None
            else bool(allow_private_addresses)
        )
        self._hostname = parsed.hostname
        self._blocked_reason: str | None = None
        if not self._allow_private_addresses:
            self._blocked_reason = resolve_blocked_address(self._hostname)
            if self._blocked_reason is not None:
                raise ValueError(
                    f"Webhook target '{describe_url(self._url)}' is rejected by "
                    f"the SSRF guard: hostname {self._blocked_reason}. Set "
                    f"{ALLOW_PRIVATE_ENV}=1 to allow private networks for "
                    "trusted environments."
                )
        SecretMasker().register_secret(self._url)

    @property
    def masked_target(self) -> str:
        """Log-safe endpoint description without path/query/fragment."""
        return describe_url(self._url)

    def send(
        self, message: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """POST the message as JSON, retrying non-2xx and network failures.

        :param message: Human-readable notification text.
        :param payload: Optional extra JSON fields merged into the body.
        :returns: Summary dict with status, attempts and HTTP status code.
        :raises WebhookDeliveryError: After all attempts are exhausted.
        """
        body: dict[str, Any] = dict(payload or {})
        body.setdefault("text", message)
        data = json.dumps(body).encode("utf-8")
        total_attempts = self._max_retries + 1
        last_reason = ""

        for attempt in range(1, total_attempts + 1):
            outcome = self._attempt(data)
            if isinstance(outcome, int) and 200 <= outcome < 300:
                logger.info(
                    _(
                        "Webhook delivered to {target} on attempt {attempt}.",
                        target=self.masked_target,
                        attempt=attempt,
                    )
                )
                return {
                    "status": "sent",
                    "attempts": attempt,
                    "status_code": outcome,
                }
            last_reason = f"HTTP {outcome}" if isinstance(outcome, int) else outcome
            if attempt < total_attempts:
                delay = _backoff_delay(self._backoff_base, BACKOFF_CAP_SECONDS, attempt)
                logger.warning(
                    _(
                        "Webhook attempt {attempt}/{total} to {target} failed "
                        "({reason}); retrying in {delay:.3f}s.",
                        attempt=attempt,
                        total=total_attempts,
                        target=self.masked_target,
                        reason=last_reason,
                        delay=delay,
                    )
                )
                time.sleep(delay)

        raise WebhookDeliveryError(
            _(
                "Webhook delivery to {target} failed after {attempts} attempts: {reason}",
                target=self.masked_target,
                attempts=total_attempts,
                reason=last_reason,
            )
        )

    def _attempt(self, data: bytes) -> int | str:
        """Perform one HTTP POST.

        The SSRF denylist is re-evaluated immediately before every attempt so
        that a retry after a long backoff does not skip the check on freshly
        re-resolved DNS.

        :returns: HTTP status code on any completed response (caller checks
            2xx), otherwise a log-safe failure reason string.
        """
        if not self._allow_private_addresses:
            reason = resolve_blocked_address(self._hostname)
            if reason is not None:
                return f"blocked by SSRF guard ({reason})"
        request = urllib.request.Request(
            self._url,
            data=data,
            method="POST",
            headers={"Content-Type": "application/json", **self._extra_headers},
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                return int(response.status)
        except urllib.error.HTTPError as exc:
            exc.close()
            return f"HTTP {exc.code}"
        except urllib.error.URLError as exc:
            return f"connection error ({exc.reason.__class__.__name__})"
        except TimeoutError:
            return "timeout"
