"""Tests for the Email library (IMAP retrieval, issue #860).

Uses a scripted fake IMAP4_SSL client in place of ``imaplib.IMAP4_SSL`` so
the full activity surface is exercised deterministically — no network.
"""

from __future__ import annotations

from email.message import EmailMessage

import pytest

from rpaforge_libraries.Email import (
    Email,
    EmailRetrievalError,
    NotConnectedError,
)
from rpaforge_libraries.Email.imap_client import (
    ImapTransport,
    sanitize_attachment_filename,
)
from rpaforge_libraries.Notifications.transports import InlinePasswordRejected


def _invoice_raw(
    sender: str = "billing@corp.example", subject: str = "Invoice #42"
) -> bytes:
    """Build a multipart MIME message with one PDF attachment."""
    message = EmailMessage()
    message["From"] = sender
    message["To"] = "me@corp.example"
    message["Subject"] = subject
    message["Date"] = "Fri, 06 Nov 2026 10:00:00 +0000"
    message.set_content("Please find the invoice attached.")
    message.add_attachment(
        b"PDFDATA",
        maintype="application",
        subtype="pdf",
        filename="invoice-42.pdf",
    )
    return message.as_bytes()


class FakeImap:
    """Scripted IMAP4_SSL double recording the essential operations."""

    instance: FakeImap | None = None

    def __init__(self, host, port=None, **_kwargs):
        self.host = host
        self.port = port
        self.selected: str | None = None
        self.login_credentials: tuple[str, str] | None = None
        self.logged_out = False
        #: uid -> (flags string, raw bytes)
        self.mailbox: dict[int, tuple[str, bytes]] = {
            101: ("\\Seen", _invoice_raw()),
            102: ("", _invoice_raw(sender="alerts@corp.example", subject="Disk full")),
        }
        self.stored: list[tuple[int, str, str]] = []
        self.copied: list[tuple[int, str]] = []
        self.expunged = 0
        FakeImap.instance = self

    def login(self, username: str, password: str) -> tuple:
        self.login_credentials = (username, password)
        return ("OK", [b"Logged in"])

    def select(self, mailbox: str, **_kwargs) -> tuple:
        self.selected = mailbox.strip('"')
        return ("OK", [b"2"])

    def uid(self, command: str, *args: object) -> tuple:
        if command == "SEARCH":
            query = " ".join(
                str(arg) for arg in args if str(arg).strip().upper() != "NONE"
            )
            uids = self._match(query)
            return ("OK", [" ".join(str(uid) for uid in uids).encode()])
        if command == "FETCH":
            uid = int(str(args[0]))
            if uid not in self.mailbox:
                return ("OK", [None])
            flags, raw = self.mailbox[uid]
            header = f"{uid} (FLAGS ({flags}) BODY[] {{{len(raw)}}})".encode()
            return ("OK", [(header, raw)])
        if command == "STORE":
            uid = int(str(args[0]))
            operation = str(args[1])
            flag = str(args[2])
            flags, raw = self.mailbox[uid]
            if operation == "+FLAGS":
                flags = flags if flag in flags else f"{flags} {flag}".strip()
            else:
                flags = " ".join(f for f in flags.split() if f != flag)
            self.mailbox[uid] = (flags, raw)
            self.stored.append((uid, operation, flag))
            return ("OK", [b"OK"])
        if command == "COPY":
            uid = int(str(args[0]))
            self.copied.append((uid, str(args[1]).strip('"')))
            return ("OK", [b"OK"])
        return ("NO", [b"unsupported"])

    def _match(self, query: str) -> list[int]:
        upper = query.upper()
        uids = sorted(self.mailbox)
        if "UNSEEN" in upper:
            uids = [uid for uid in uids if "\\Seen" not in self.mailbox[uid][0]]
        return uids

    def expunge(self) -> tuple:
        self.expunged += 1
        return ("OK", [b"1"])

    def close(self) -> tuple:
        return ("OK", [b"Closed"])

    def logout(self) -> tuple:
        self.logged_out = True
        return ("BYE", [b"Logging out"])


@pytest.fixture(autouse=True)
def fake_imap(monkeypatch):
    monkeypatch.setattr(
        "rpaforge_libraries.Email.imap_client.imaplib.IMAP4_SSL", FakeImap
    )

    class _StubSecretProvider:
        def get_secret(self, _key: str, namespace: str = "default") -> str:
            return f"resolved-{namespace}-password"

    monkeypatch.setattr(
        "rpaforge_libraries.Notifications.transports.get_secret_provider",
        lambda _provider_type: _StubSecretProvider(),
    )
    FakeImap.instance = None
    yield


def _connected_email() -> Email:
    client = Email()
    client.connect_imap(
        "mail.corp.example",
        username="me@corp.example",
        password_secret_ref="keyring://default/IMAP_PASSWORD",
    )
    return client


class TestConnectDisconnect:
    """Connection lifecycle and secret handling (issue #860)."""

    def test_connect_selects_inbox_and_authenticates(self):
        _connected_email()
        fake = FakeImap.instance
        assert fake is not None
        assert fake.selected == "INBOX"
        assert fake.login_credentials == (
            "me@corp.example",
            "resolved-default-password",
        )

    def test_connect_resolves_password_only_via_secret_ref(self):
        client = Email()
        with pytest.raises(InlinePasswordRejected):
            client.connect_imap(
                "mail.corp.example",
                username="user",
                password_secret_ref="hunter2-inline",
            )

    def test_activities_before_connect_raise(self):
        client = Email()
        with pytest.raises(NotConnectedError):
            client.list_messages()

    def test_disconnect_is_idempotent(self):
        client = _connected_email()
        first = client.disconnect()
        second = client.disconnect()
        assert "Disconnected" in first
        assert second == "Not connected"


class TestListAndFetch:
    """Search and fetch semantics (issue #860)."""

    def test_list_messages_returns_summaries(self):
        client = _connected_email()
        summaries = client.list_messages()
        assert [item["uid"] for item in summaries] == [101, 102]
        assert summaries[0]["subject"] == "Invoice #42"
        assert summaries[0]["from"] == "billing@corp.example"
        assert summaries[0]["seen"] is True
        assert summaries[1]["seen"] is False

    def test_list_messages_unread_only_uses_unseen_criteria(self):
        client = _connected_email()
        summaries = client.list_messages(unread_only=True)
        assert [item["uid"] for item in summaries] == [102]

    def test_list_messages_rejects_bad_since_date(self):
        client = _connected_email()
        with pytest.raises(ValueError, match="YYYY-MM-DD"):
            client.list_messages(since_date="06/11/2026")

    def test_fetch_message_without_seen_flip(self):
        client = _connected_email()
        detail = client.fetch_message(102)
        assert detail["subject"] == "Disk full"
        assert "invoice attached" in detail["body_text"]
        assert detail["attachment_names"] == ["invoice-42.pdf"]
        fake = FakeImap.instance
        assert fake.mailbox[102][0] == ""  # \\Seen NOT set by fetch

    def test_fetch_missing_uid_raises(self):
        client = _connected_email()
        with pytest.raises(EmailRetrievalError, match="not found"):
            client.fetch_message(999)


class TestFlagsAndFolders:
    """Flag changes, deletion and copies (issue #860)."""

    def test_mark_as_read_then_unread(self):
        client = _connected_email()
        client.mark_as_read(102)
        assert FakeImap.instance.mailbox[102][1] is not None
        assert "\\Seen" in FakeImap.instance.mailbox[102][0]
        client.mark_as_unread(102)
        assert "\\Seen" not in FakeImap.instance.mailbox[102][0]

    def test_delete_with_expunge(self):
        client = _connected_email()
        result = client.delete_message(102, expunge=True)
        assert "deleted" in result
        assert FakeImap.instance.expunged == 1

    def test_copy_message(self):
        client = _connected_email()
        result = client.copy_message(101, "Archive")
        assert "Archive" in result
        assert FakeImap.instance.copied == [(101, "Archive")]


class TestAttachments:
    """Attachment saving with sanitisation and size caps (issue #860)."""

    def test_fetch_attachments_saves_sanitised(self, tmp_path):
        client = _connected_email()
        saved = client.fetch_attachments(101, str(tmp_path))
        assert len(saved) == 1
        assert saved[0]["filename"] == "invoice-42.pdf"
        assert (tmp_path / "invoice-42.pdf").read_bytes() == b"PDFDATA"

    def test_untrusted_attachment_name_refused(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            "rpaforge_libraries.Email.library.decode_mime_header",
            lambda value: "../evil.pdf" if value else "",
        )
        client = _connected_email()
        with pytest.raises(EmailRetrievalError, match="untrusted filename"):
            client.fetch_attachments(101, str(tmp_path))
        assert not (tmp_path / "evil.pdf").exists()

    def test_oversized_attachment_refused(self, tmp_path):
        big = EmailMessage()
        big["From"] = "billing@corp.example"
        big["Subject"] = "Big"
        big.set_content("body")
        big.add_attachment(
            b"x" * (10 * 1024 * 1024),
            maintype="application",
            subtype="zip",
            filename="dump.zip",
        )
        client = _connected_email()
        FakeImap.instance.mailbox[101] = ("", big.as_bytes())
        with pytest.raises(EmailRetrievalError, match="cap"):
            client.fetch_attachments(101, str(tmp_path), max_attachment_mb=1)


class TestSanitizeAttachmentFilename:
    """Filename sanitiser rules (parity with Serialization ZIP, #821)."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("invoice.pdf", "invoice.pdf"),
            ("report 2026.xlsx", "report 2026.xlsx"),
            ("folder/report.pdf", "report.pdf"),
            ("", None),
            ("..", None),
            ("../evil.pdf", None),
            ("..\\evil.pdf", None),
            ("/abs/path.pdf", None),
            ("C:\\data\\evil.pdf", None),
            ("con.txt", "_con.txt"),
        ],
    )
    def test_rules(self, raw, expected):
        assert sanitize_attachment_filename(raw) == expected


class TestTransportUnit:
    """Transport-level guards without a fake server."""

    def test_empty_host_rejected(self):
        with pytest.raises(ValueError, match="non-empty"):
            ImapTransport("")

    def test_invalid_security_mode_rejected(self):
        with pytest.raises(ValueError, match="security_mode"):
            ImapTransport("host", security_mode="telnet")

    def test_password_without_username_rejected(self):
        with pytest.raises(ValueError, match="username"):
            ImapTransport("host", password="secret")

    def test_double_connect_rejected(self):
        transport = ImapTransport("host")
        transport.connect()
        with pytest.raises(EmailRetrievalError, match="Already connected"):
            transport.connect()
