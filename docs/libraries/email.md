# Email Library

## Overview

Email is an IMAP mailbox-retrieval library (stdlib `imaplib` only) — the receiving counterpart to the Notifications library's SMTP send. Mailbox-driven automation: invoice intake, support triage, report distribution.

Message identity is the server-assigned **UID** (stable within a mailbox); every operation goes through IMAP UID commands so sequence-number churn after expunges cannot target the wrong message. Reading never flips the `\Seen` flag implicitly — `Mark As Read` does that explicitly.

## Installation

No additional dependencies required.

## Security

- The password is resolved ONLY through a Credentials SecretProvider reference (`<provider>://<namespace>/<key>`); inline passwords raise `InlinePasswordRejected` by design.
- Attachment filenames are sanitised before anything touches the disk: absolute paths, `..` segments (including backslash variants), drive-letter targets and Windows reserved device names are rejected — mirroring the Serialization ZIP protection. Attachments larger than the per-file cap are refused.

## Keywords

### connect_imap
**Description:** Open an IMAP session, authenticate and select a mailbox.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| host | str | Yes | IMAP server hostname |
| port | int | No | Server port (0 = 993 for ssl, 143 otherwise) |
| security_mode | str | No | `ssl` (implicit TLS), `starttls` or `none` (default: 'ssl') |
| username | str | No | Username or secret reference |
| password_secret_ref | str | No | Mandatory secret reference to the password |
| timeout | float | No | Socket timeout in seconds (default: 30.0) |
| folder | str | No | Mailbox selected after connecting (default: 'INBOX') |

**Returns:** str - Connection summary

### select_folder
**Description:** Select the mailbox used by subsequent operations.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| folder | str | No | Mailbox name (default: 'INBOX') |

**Returns:** str - Selected folder name

### list_messages
**Description:** Search the selected mailbox and return message summaries.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| unread_only | bool | No | Only UNSEEN messages (default: False) |
| from_contains | str | No | FROM filter substring |
| subject_contains | str | No | SUBJECT filter substring |
| since_date | str | No | SINCE date, YYYY-MM-DD |
| limit | int | No | Max messages returned (0 = all, default: 50) |

**Returns:** list[dict] - Summaries with uid, subject, from, date, seen, size, flags

### fetch_message
**Description:** Fetch one message by UID without marking it as read.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| uid | int | Yes | Message UID from List Messages |

**Returns:** dict - uid, subject, from, to, date, body_text, body_html, attachment_names, seen

### fetch_attachments
**Description:** Save the message's attachments with sanitised filenames.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| uid | int | Yes | Message UID |
| save_dir | str | Yes | Directory for saved files (created when missing) |
| max_attachment_mb | float | No | Per-attachment size cap in MB (default: 25.0) |

**Returns:** list[dict] - filename, path, size

### mark_as_read
**Description:** Set `\Seen` on a message.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| uid | int | Yes | Message UID to mark seen |

**Returns:** str - Confirmation

### mark_as_unread
**Description:** Clear `\Seen` on a message.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| uid | int | Yes | Message UID to mark unseen |

**Returns:** str - Confirmation

### delete_message
**Description:** Flag a message `\Deleted` and optionally expunge.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| uid | int | Yes | Message UID to delete |
| expunge | bool | No | Purge deleted messages right away (default: True) |

**Returns:** str - Confirmation with the purge count

### copy_message
**Description:** Copy a message to another mailbox (move = copy + delete).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| uid | int | Yes | Message UID to copy |
| target_folder | str | Yes | Destination mailbox |

**Returns:** str - Confirmation

### disconnect
**Description:** Close the mailbox and log out (idempotent).

**Returns:** str - Confirmation

## Example

```python
from rpaforge_libraries.Email import Email

email = Email()
email.connect_imap(
    "imap.corp.example",
    username="billing@corp.example",
    password_secret_ref="vault://prod/IMAP_PASSWORD",
)
for summary in email.list_messages(unread_only=True, from_contains="invoice"):
    detail = email.fetch_message(summary["uid"])
    email.fetch_attachments(summary["uid"], "./invoices")
    email.mark_as_read(summary["uid"])
email.disconnect()
```
