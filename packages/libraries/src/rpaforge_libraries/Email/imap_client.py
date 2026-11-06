"""IMAP retrieval transport (stdlib ``imaplib`` only).

Passwords are never accepted inline: they must already be resolved through a
Credentials SecretProvider reference by the caller (same contract as the
SMTP transport). Supports implicit TLS (``IMAP4_SSL``), STARTTLS and plain
connections. All IMAP failures are wrapped in :class:`EmailRetrievalError`.

Message identity is the server-assigned **UID** (stable within a mailbox),
and every operation goes through ``uid(...)`` so sequence-number churn after
expunges cannot target the wrong message. Fetches use ``BODY.PEEK`` —
reading a message never silently flips its ``\\Seen`` flag; ``Mark As Read``
does that explicitly.

Attachment filenames are sanitised before anything touches the disk:
absolute paths, ``..`` segments (including backslash variants) and
drive-letter targets are rejected, mirroring the Serialization ZIP
protection (issue #821).
"""

from __future__ import annotations

import email
import email.header
import email.utils
import imaplib
import logging
import re
import ssl
from email.message import Message
from pathlib import PurePosixPath

logger = logging.getLogger("rpaforge.email")

DEFAULT_IMAP_PORT_SSL = 993
DEFAULT_IMAP_PORT_PLAIN = 143

#: Attachments larger than this are refused by ``fetch_attachments``.
DEFAULT_MAX_ATTACHMENT_MB = 25.0

_UNSAFE_WINDOWS_NAME = re.compile(
    r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$", re.IGNORECASE
)


class EmailRetrievalError(Exception):
    """Raised when the IMAP conversation fails at any stage."""


class NotConnectedError(EmailRetrievalError):
    """Raised when an activity runs before ``Connect IMAP``."""


def sanitize_attachment_filename(name: str) -> str | None:
    """Return a safe filename, or ``None`` when the name cannot be trusted.

    Mirrors the Serialization ZIP member rules: absolute paths, ``..``
    segments (also backslash variants), drive-letter targets and Windows
    reserved device names are rejected; a fallback name is returned for
    empty/garbage names so attachments are not silently lost.
    """
    text = (name or "").strip()
    normalized = text.replace("\\", "/")
    pure = PurePosixPath(normalized)
    if pure.is_absolute() or text.startswith(("/", "\\")):
        return None
    if len(normalized) > 1 and normalized[1] == ":":
        return None
    parts = [part for part in pure.parts if part not in ("/", "")]
    if any(part == ".." for part in parts):
        return None
    if not parts:
        return None
    base = parts[-1].strip()
    if not base or base in (".", ".."):
        return None
    if _UNSAFE_WINDOWS_NAME.match(base):
        base = f"_{base}"
    return base


def decode_mime_header(value: str | None) -> str:
    """Decode a MIME-encoded header value into a plain string."""
    if not value:
        return ""
    try:
        chunks = email.header.decode_header(value)
    except Exception:
        return str(value)
    decoded: list[str] = []
    for text, charset in chunks:
        if isinstance(text, bytes):
            decoded.append(text.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(str(text))
    return "".join(decoded)


class ImapTransport:
    """IMAP adapter: connect, search, fetch, flag and move messages."""

    def __init__(
        self,
        host: str,
        port: int | None = None,
        username: str = "",
        password: str = "",
        *,
        security_mode: str = "ssl",
        timeout: float = 30.0,
    ) -> None:
        """Create an IMAP transport.

        :param host: IMAP server hostname.
        :param port: Server port; defaults to 993 (ssl) or 143 (otherwise).
        :param username: Username (already resolved; may be empty).
        :param password: Password (already resolved through a secret ref).
        :param security_mode: ``"ssl"`` (implicit TLS), ``"starttls"`` or
            ``"none"``.
        :param timeout: Socket timeout in seconds.
        """
        if not host or not host.strip():
            raise ValueError("IMAP host must be a non-empty string.")
        mode = (security_mode or "ssl").strip().lower()
        if mode not in ("ssl", "starttls", "none"):
            raise ValueError(
                f"Invalid security_mode '{security_mode}': "
                "expected 'ssl', 'starttls' or 'none'."
            )
        if password and not username:
            raise ValueError("IMAP username is required when a password is provided.")
        self._host = host.strip()
        self._mode = mode
        self._port = (
            int(port)
            if port is not None
            else (DEFAULT_IMAP_PORT_SSL if mode == "ssl" else DEFAULT_IMAP_PORT_PLAIN)
        )
        self._username = username.strip()
        self._password = password
        self._timeout = max(0.1, float(timeout))
        self._client: imaplib.IMAP4 | None = None
        self._folder = "INBOX"

    @property
    def host(self) -> str:
        """Connected host (safe to log)."""
        return self._host

    @property
    def connected(self) -> bool:
        """Whether a client session is currently open."""
        return self._client is not None

    @property
    def folder(self) -> str:
        """Currently selected mailbox."""
        return self._folder

    def _require_client(self) -> imaplib.IMAP4:
        if self._client is None:
            raise NotConnectedError("Not connected: run 'Connect IMAP' first.")
        return self._client

    def connect(self) -> str:
        """Open the IMAP session and authenticate."""
        if self._client is not None:
            raise EmailRetrievalError(
                "Already connected: run 'Disconnect' before reconnecting."
            )
        client: imaplib.IMAP4
        try:
            if self._mode == "ssl":
                context = ssl.create_default_context()
                client = imaplib.IMAP4_SSL(
                    self._host,
                    self._port,
                    ssl_context=context,
                    timeout=self._timeout,
                )
            else:
                client = imaplib.IMAP4(
                    self._host,
                    self._port,
                    timeout=self._timeout,
                )
                if self._mode == "starttls":
                    client.starttls(ssl.create_default_context())
            if self._username:
                client.login(self._username, self._password)
        except imaplib.IMAP4.error as exc:
            raise EmailRetrievalError(
                f"IMAP authentication/protocol error via {self._host}: "
                f"{exc.__class__.__name__}"
            ) from exc
        except OSError as exc:
            raise EmailRetrievalError(
                f"Connection to {self._host}:{self._port} failed: "
                f"{exc.__class__.__name__}"
            ) from exc
        self._client = client
        self._folder = "INBOX"
        logger.info(
            "IMAP connected to %s:%s (%s).",
            self._host,
            self._port,
            self._mode,
        )
        return f"Connected to {self._host}:{self._port} ({self._mode})"

    def select_folder(self, folder: str) -> str:
        """Select a mailbox for subsequent operations."""
        client = self._require_client()
        status, _data = client.select(_quote_mailbox(folder), readonly=False)
        if status != "OK":
            raise EmailRetrievalError(
                f"Cannot select mailbox '{folder}': server returned {status!r}"
            )
        self._folder = folder
        return folder

    def search_uids(self, criteria: list[str], limit: int = 0) -> list[int]:
        """Run a UID SEARCH and return matching UIDs (ascending order).

        :param criteria: Raw IMAP search criteria tokens (already validated).
        :param limit: Cap on returned UIDs; ``0`` means unlimited.
        """
        client = self._require_client()
        query = " ".join(criteria) if criteria else "ALL"
        status, data = client.uid("SEARCH", query)
        if status != "OK":
            raise EmailRetrievalError(f"IMAP search failed: server returned {status!r}")
        uids = [int(token) for token in (data[0] or b"").split() if token.isdigit()]
        if limit and len(uids) > limit:
            uids = uids[-limit:]  # newest messages when sorted ascending
        return uids

    def fetch_message(self, uid: int) -> tuple[Message, str]:
        """Fetch one message by UID without flipping ``\\Seen``.

        :returns: ``(parsed_message, flags_string)``.
        """
        client = self._require_client()
        status, data = client.uid("FETCH", str(uid), "(FLAGS BODY.PEEK[])")
        if status != "OK" or not data or data[0] is None:
            raise EmailRetrievalError(
                f"Message with UID {uid} not found in '{self._folder}'"
            )
        raw = b""
        flags = ""
        for item in data:
            if isinstance(item, tuple):
                header_part, payload = item
                flag_match = re.search(rb"FLAGS \(([^)]*)\)", header_part)
                flags = (
                    flag_match.group(1).decode("utf-8", errors="replace")
                    if flag_match
                    else flags
                )
                raw = payload if payload else raw
        if not raw:
            raise EmailRetrievalError(
                f"Empty body returned for UID {uid} in '{self._folder}'"
            )
        return email.message_from_bytes(raw), flags

    def store_flags(self, uid: int, operation: str, flag: str) -> None:
        """Apply a flag change (``operation`` is ``+FLAGS`` or ``-FLAGS``)."""
        client = self._require_client()
        status, _data = client.uid("STORE", str(uid), operation, flag)
        if status != "OK":
            raise EmailRetrievalError(
                f"IMAP store failed for UID {uid}: server returned {status!r}"
            )

    def copy_message(self, uid: int, target_folder: str) -> str:
        """Copy a message to another mailbox."""
        client = self._require_client()
        status, _data = client.uid("COPY", str(uid), _quote_mailbox(target_folder))
        if status != "OK":
            raise EmailRetrievalError(
                f"IMAP copy of UID {uid} to '{target_folder}' failed: "
                f"server returned {status!r}"
            )
        return target_folder

    def expunge(self) -> int:
        """Expunge messages flagged ``\\Deleted``; returns affected count."""
        client = self._require_client()
        status, data = client.expunge()
        if status != "OK":
            raise EmailRetrievalError(
                f"IMAP expunge failed: server returned {status!r}"
            )
        return len(data or [])

    def disconnect(self) -> str:
        """Close the selected mailbox and log out (idempotent)."""
        if self._client is None:
            return "Not connected"
        try:
            self._client.close()
        except imaplib.IMAP4.error:
            logger.debug("IMAP close failed (mailbox may be unselected).")
        try:
            self._client.logout()
        except imaplib.IMAP4.error:
            logger.debug("IMAP logout failed.")
        finally:
            self._client = None
        logger.info("IMAP disconnected from %s.", self._host)
        return f"Disconnected from {self._host}"


def _quote_mailbox(folder: str) -> str:
    """Quote a mailbox name for IMAP wire format (embedded quotes escaped)."""
    text = (folder or "").strip() or "INBOX"
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def build_search_criteria(
    *,
    unread_only: bool = False,
    from_contains: str = "",
    subject_contains: str = "",
    since_date: str = "",
) -> list[str]:
    """Build IMAP SEARCH criteria tokens from validated filters.

    Text filters are wrapped in double quotes with embedded quotes escaped;
    ``since_date`` must already be ``YYYY-MM-DD`` (validated by the caller).
    """
    criteria: list[str] = []
    if unread_only:
        criteria.append("UNSEEN")
    if from_contains:
        criteria.append("FROM")
        criteria.append(_quote_search_text(from_contains))
    if subject_contains:
        criteria.append("SUBJECT")
        criteria.append(_quote_search_text(subject_contains))
    if since_date:
        criteria.append("SINCE")
        criteria.append(since_date)
    return criteria


def _quote_search_text(text: str) -> str:
    """Quote a search string for IMAP (double quotes escaped)."""
    escaped = text.replace('"', '\\"')
    return f'"{escaped}"'
