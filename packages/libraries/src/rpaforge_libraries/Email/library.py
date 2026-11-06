"""RPAForge Email Library - mailbox retrieval via IMAP (issue #860).

Complements the Notifications library (SMTP send): mailbox-driven
automation — invoice intake, support triage, report distribution. All
message identity is the server-assigned UID, and reading never flips
``\\Seen`` implicitly (``Mark As Read`` is explicit). Attachments are
written with sanitised filenames and a per-file size cap.
"""

from __future__ import annotations

import logging
from email.message import Message
from email.utils import parseaddr
from pathlib import Path
from typing import Any

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge_libraries.Email.imap_client import (
    DEFAULT_MAX_ATTACHMENT_MB,
    EmailRetrievalError,
    ImapTransport,
    NotConnectedError,
    build_search_criteria,
    decode_mime_header,
    sanitize_attachment_filename,
)
from rpaforge_libraries.i18n import _
from rpaforge_libraries.Notifications.transports import resolve_secret_ref

logger = logging.getLogger("rpaforge.email")


@library(name="Email", category="Integrations", icon="📧")
class Email:
    """Mailbox retrieval library: IMAP search, fetch, flags and moves.

    Stateful library — the IMAP session opened by ``Connect IMAP`` lives on
    the instance (see the stateful-library guardrails). All results are
    plain JSON-safe dicts that safely cross the stateful subprocess
    boundary.
    """

    def __init__(self) -> None:
        self._transport: ImapTransport | None = None

    def _require_transport(self) -> ImapTransport:
        if self._transport is None:
            raise NotConnectedError(
                "Not connected: run 'Connect IMAP' before this activity."
            )
        return self._transport

    @activity(name="Connect IMAP", category="Email")
    @tags("email", "imap", "mail", "connect")
    @output("Connection summary string")
    @param("host", type="string", description="IMAP server hostname.")
    @param("port", type="integer", description="Server port (0 = default per mode).")
    @param(
        "security_mode",
        type="string",
        description="One of: ssl (implicit TLS), starttls, none.",
    )
    @param(
        "username",
        type="secret",
        description="Username, either plain or a secret reference.",
    )
    @param(
        "password_secret_ref",
        type="secret",
        description=(
            "Mandatory secret reference to the password "
            "(<provider>://<namespace>/<key>). Inline passwords are rejected."
        ),
    )
    @param("timeout", type="float", description="Socket timeout in seconds.")
    @param(
        "folder",
        type="string",
        description="Mailbox selected right after connecting (default INBOX).",
    )
    def connect_imap(
        self,
        host: str,
        port: int = 0,
        security_mode: str = "ssl",
        username: str = "",
        password_secret_ref: str = "",
        timeout: float = 30.0,
        folder: str = "INBOX",
    ) -> str:
        """Open an IMAP session and authenticate.

        :param host: IMAP server hostname.
        :param port: Server port; ``0`` picks 993 (ssl) or 143 (otherwise).
        :param security_mode: ``"ssl"``, ``"starttls"`` or ``"none"``.
        :param username: Username or secret reference for it.
        :param password_secret_ref: Secret reference to the password.
        :param timeout: Socket timeout in seconds.
        :param folder: Mailbox selected right after connecting (INBOX default).
        :returns: Connection summary.
        :raises rpaforge_libraries.Notifications.transports.InlinePasswordRejected:
            When the password is not a valid secret reference.
        :raises EmailRetrievalError: When the connection or login fails.
        """
        if self._transport is not None:
            raise EmailRetrievalError(
                "Already connected: run 'Disconnect' before reconnecting."
            )
        resolved_username = resolve_secret_ref(
            username, allow_plain=True, field="username"
        )
        resolved_password = resolve_secret_ref(
            password_secret_ref, allow_plain=False, field="password"
        )
        transport = ImapTransport(
            host,
            port=port or None,
            username=resolved_username,
            password=resolved_password,
            security_mode=security_mode,
            timeout=timeout,
        )
        summary = transport.connect()
        transport.select_folder(folder)
        self._transport = transport
        return summary

    @activity(name="Select Folder", category="Email")
    @tags("email", "imap", "folder", "mailbox")
    @output("Selected folder name")
    @param("folder", type="string", description="Mailbox name, e.g. INBOX.")
    def select_folder(self, folder: str = "INBOX") -> str:
        """Select the mailbox used by subsequent operations."""
        return self._require_transport().select_folder(folder)

    @activity(name="List Messages", category="Email")
    @tags("email", "imap", "search", "list")
    @output("List of message summaries (uid, subject, from, date, seen, size)")
    @param("unread_only", type="boolean", description="Only UNSEEN messages.")
    @param("from_contains", type="string", description="FROM filter substring.")
    @param("subject_contains", type="string", description="SUBJECT filter substring.")
    @param("since_date", type="string", description="SINCE date, YYYY-MM-DD.")
    @param("limit", type="integer", description="Max messages returned (0 = all).")
    def list_messages(
        self,
        unread_only: bool = False,
        from_contains: str = "",
        subject_contains: str = "",
        since_date: str = "",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Search the selected mailbox and return message summaries.

        :param unread_only: Restrict the search to UNSEEN messages.
        :param from_contains: Substring matched against the From header.
        :param subject_contains: Substring matched against the Subject header.
        :param since_date: ``YYYY-MM-DD`` lower bound (IMAP SINCE).
        :param limit: Cap on returned summaries; ``0`` means all matches.
        :returns: List of dicts with uid, subject, from, date, seen, size.
        """
        if since_date and not _valid_date(since_date):
            raise ValueError(f"Invalid since_date '{since_date}': expected YYYY-MM-DD.")
        transport = self._require_transport()
        criteria = build_search_criteria(
            unread_only=unread_only,
            from_contains=from_contains,
            subject_contains=subject_contains,
            since_date=since_date,
        )
        uids = transport.search_uids(criteria, limit=max(0, int(limit)))
        summaries: list[dict[str, Any]] = []
        for uid in uids:
            message, flags = transport.fetch_message(uid)
            summaries.append(_summarise(uid, message, flags))
        logger.info(_("IMAP search found {count} message(s).", count=len(summaries)))
        return summaries

    @activity(name="Fetch Message", category="Email")
    @tags("email", "imap", "fetch", "body")
    @output(
        "Message detail (uid, subject, from, to, date, body_text, body_html, "
        "attachment_names, seen)"
    )
    @param("uid", type="integer", description="Message UID from List Messages.")
    def fetch_message(self, uid: int) -> dict[str, Any]:
        """Fetch one message by UID without marking it as read.

        :param uid: Message UID (from ``List Messages``).
        :returns: Dict with headers, text and HTML bodies, attachment names.
        """
        transport = self._require_transport()
        message, flags = transport.fetch_message(int(uid))
        return _detail(uid, message, flags)

    @activity(name="Fetch Attachments", category="Email")
    @tags("email", "imap", "attachment", "save")
    @output("List of saved attachment dicts (filename, path, size)")
    @param("uid", type="integer", description="Message UID from List Messages.")
    @param("save_dir", type="string", description="Directory for saved files.")
    @param(
        "max_attachment_mb",
        type="float",
        description="Refuse attachments larger than this many MB.",
    )
    def fetch_attachments(
        self,
        uid: int,
        save_dir: str,
        max_attachment_mb: float = DEFAULT_MAX_ATTACHMENT_MB,
    ) -> list[dict[str, Any]]:
        """Save the message's attachments to ``save_dir``.

        Filenames are sanitised (path-traversal-safe, Windows reserved names
        renamed, duplicates suffixed); a single oversized or untrusted-name
        attachment raises instead of being written.

        :param uid: Message UID.
        :param save_dir: Destination directory (created when missing).
        :param max_attachment_mb: Per-attachment size cap in MB.
        :returns: List of dicts with filename, path, size.
        """
        transport = self._require_transport()
        destination = Path(save_dir).resolve()
        destination.mkdir(parents=True, exist_ok=True)
        size_cap = max(0.001, float(max_attachment_mb)) * 1024 * 1024

        message, _flags = transport.fetch_message(int(uid))
        used_names: set[str] = set()
        saved: list[dict[str, Any]] = []
        for part in message.walk():
            filename = part.get_filename()
            if not filename:
                continue
            safe_name = sanitize_attachment_filename(decode_mime_header(filename))
            if safe_name is None:
                raise EmailRetrievalError(
                    f"Attachment with untrusted filename refused: {filename!r}"
                )
            payload = part.get_payload(decode=True)
            if not isinstance(payload, (bytes, bytearray)):
                continue
            if len(payload) > size_cap:
                raise EmailRetrievalError(
                    f"Attachment '{safe_name}' exceeds the "
                    f"{max_attachment_mb} MB cap ({len(payload)} bytes)."
                )
            unique_name = _unique_name(safe_name, used_names)
            target = destination / unique_name
            target.write_bytes(payload)
            used_names.add(unique_name)
            saved.append(
                {
                    "filename": unique_name,
                    "path": str(target),
                    "size": len(payload),
                }
            )
        logger.info(
            _(
                "Saved {count} attachment(s) from UID {uid} to {dir}.",
                count=len(saved),
                uid=uid,
                dir=str(destination),
            )
        )
        return saved

    @activity(name="Mark As Read", category="Email")
    @tags("email", "imap", "flag", "seen")
    @output("Confirmation string")
    @param("uid", type="integer", description="Message UID to mark seen.")
    def mark_as_read(self, uid: int) -> str:
        """Set ``\\Seen`` on a message."""
        self._require_transport().store_flags(int(uid), "+FLAGS", "\\Seen")
        return f"UID {uid} marked as read"

    @activity(name="Mark As Unread", category="Email")
    @tags("email", "imap", "flag", "unseen")
    @output("Confirmation string")
    @param("uid", type="integer", description="Message UID to mark unseen.")
    def mark_as_unread(self, uid: int) -> str:
        """Clear ``\\Seen`` on a message."""
        self._require_transport().store_flags(int(uid), "-FLAGS", "\\Seen")
        return f"UID {uid} marked as unread"

    @activity(name="Delete Message", category="Email")
    @tags("email", "imap", "delete", "expunge")
    @output("Confirmation string")
    @param("uid", type="integer", description="Message UID to delete.")
    @param("expunge", type="boolean", description="Expunge immediately.")
    def delete_message(self, uid: int, expunge: bool = True) -> str:
        """Flag a message ``\\Deleted`` and optionally expunge.

        :param uid: Message UID.
        :param expunge: Purge deleted messages right away.
        :returns: Confirmation with the expunge count when applied.
        """
        transport = self._require_transport()
        transport.store_flags(int(uid), "+FLAGS", "\\Deleted")
        if expunge:
            purged = transport.expunge()
            return f"UID {uid} deleted ({purged} message(s) purged)"
        return f"UID {uid} flagged for deletion"

    @activity(name="Copy Message", category="Email")
    @tags("email", "imap", "copy", "move", "folder")
    @output("Confirmation string")
    @param("uid", type="integer", description="Message UID to copy.")
    @param("target_folder", type="string", description="Destination mailbox.")
    def copy_message(self, uid: int, target_folder: str) -> str:
        """Copy a message to another mailbox (move = copy + delete)."""
        folder = self._require_transport().copy_message(int(uid), target_folder)
        return f"UID {uid} copied to {folder}"

    @activity(name="Disconnect", category="Email")
    @tags("email", "imap", "disconnect", "cleanup")
    @output("Confirmation string")
    def disconnect(self) -> str:
        """Close the mailbox and log out (idempotent)."""
        if self._transport is None:
            return "Not connected"
        summary = self._transport.disconnect()
        self._transport = None
        return summary


def _valid_date(text: str) -> bool:
    """Whether ``text`` is a strict ``YYYY-MM-DD`` date."""
    import re

    return re.fullmatch(r"\d{4}-\d{2}-\d{2}", text or "") is not None


def _unique_name(name: str, used: set[str]) -> str:
    """Suffix ``name`` (report.pdf → report-2.pdf) until unique."""
    if name not in used:
        return name
    stem = Path(name).stem
    suffix = Path(name).suffix
    counter = 2
    while f"{stem}-{counter}{suffix}" in used:
        counter += 1
    return f"{stem}-{counter}{suffix}"


def _sender(message: Message) -> str:
    """Best-effort plain From address."""
    return parseaddr(decode_mime_header(message.get("From", "")))[1]


def _summarise(uid: int, message: Message, flags: str) -> dict[str, Any]:
    """Build the List Messages summary dict."""
    body = message.get_payload(decode=True)
    return {
        "uid": uid,
        "subject": decode_mime_header(message.get("Subject", "")),
        "from": _sender(message),
        "date": decode_mime_header(message.get("Date", "")),
        "seen": "\\Seen" in flags,
        "size": len(body or b""),
        "flags": flags.strip(),
    }


def _detail(uid: int, message: Message, flags: str) -> dict[str, Any]:
    """Build the Fetch Message detail dict (plain + HTML bodies)."""
    text_body = ""
    html_body = ""
    attachment_names: list[str] = []
    for part in message.walk():
        if part.get_filename():
            attachment_names.append(decode_mime_header(part.get_filename()))
            continue
        content_type = part.get_content_type()
        if content_type == "text/plain" and not text_body:
            payload = part.get_payload(decode=True)
            if isinstance(payload, bytes):
                charset = part.get_content_charset() or "utf-8"
                text_body = payload.decode(charset, errors="replace")
        elif content_type == "text/html" and not html_body:
            payload = part.get_payload(decode=True)
            if isinstance(payload, bytes):
                charset = part.get_content_charset() or "utf-8"
                html_body = payload.decode(charset, errors="replace")
    return {
        "uid": uid,
        "subject": decode_mime_header(message.get("Subject", "")),
        "from": _sender(message),
        "to": decode_mime_header(message.get("To", "")),
        "date": decode_mime_header(message.get("Date", "")),
        "body_text": text_body,
        "body_html": html_body,
        "attachment_names": attachment_names,
        "seen": "\\Seen" in flags,
    }
