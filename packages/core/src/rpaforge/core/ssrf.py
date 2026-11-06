"""Shared SSRF-guard primitives for outbound HTTP callers (issue #861).

Originally introduced for the webhook transport (issue #825) and extracted
here so every outbound HTTP surface — Notifications webhook, the HTTP
library — applies the same denylist. By default callers refuse targets that
resolve to private, loopback, link-local (incl. cloud metadata
169.254.169.254), reserved, multicast or unspecified addresses: a crafted
diagram must not be able to probe or exfiltrate into the runtime's internal
network. Hostnames are resolved at request time and *all* resolved addresses
must be public; DNS failure counts as blocked (fail closed).

Known limitation: the check runs immediately before the request, so a
hostile DNS server with short TTLs could still rebind between check and
connect; run unattended workloads in a network-restricted environment
(Docker network policies / policy network egress) when executing untrusted
diagrams.
"""

from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse

_TRUTHY = ("1", "true", "yes", "on")


def allow_private_from_env(env_var: str) -> bool:
    """Whether ``env_var`` (``1``/``true``/``yes``/``on``) lifts the denylist."""
    return os.environ.get(env_var, "").strip().lower() in _TRUTHY


def address_blocked(ip_text: str) -> bool:
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
        if address_blocked(ip_text):
            return f"resolves to non-public address {ip_text}"
    return None


def http_hostname(url: str) -> str | None:
    """Return the hostname of an absolute http(s) URL, else ``None``."""
    if not isinstance(url, str):
        return None
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    return parsed.hostname
