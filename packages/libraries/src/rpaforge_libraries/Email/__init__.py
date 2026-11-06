"""RPAForge Email Library.

IMAP mailbox retrieval: search, fetch, flags, copies and attachments — the
receiving counterpart to the Notifications library's SMTP send. Passwords
only via Credentials SecretProvider references; attachment filenames are
sanitised before hitting the disk (issue #860).
"""

from rpaforge_libraries.Email.imap_client import (
    EmailRetrievalError,
    ImapTransport,
    NotConnectedError,
)
from rpaforge_libraries.Email.library import Email

__all__ = [
    "Email",
    "EmailRetrievalError",
    "ImapTransport",
    "NotConnectedError",
]
