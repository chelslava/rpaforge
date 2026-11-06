# Email Intake

Template process for mailbox-driven automation with the **Email library**
(IMAP retrieval, issue #860): poll an inbox for unread invoice emails, save
their attachments into a working folder and mark them read.

```
Start ──► Connect IMAP ──► List unread ("invoice") ──► ForEach uid:
            └─ for each: Fetch Attachments → ./intake ──► Mark As Read
       ──► Disconnect ──► End
```

## Setup

1. Store the mailbox password in a secret provider, e.g. with the `env://`
   provider put `IMAP_PASSWORD` into the environment (or use `vault://`,
   `keyring://`, `aws://`, `azure://` refs).
2. Update `node-connect` with your host/username; adjust the
   `List Messages` filters (`subject_contains`, `from_contains`,
   `since_date`) as needed.
3. Import `process.json` in RPAForge Studio (or run it with
   `rpaforge-runner run`) and execute.

## Notes

- Reading a message never flips `\\Seen` implicitly — `Mark As Read` is
  explicit, so a crashed run re-processes the same messages.
- Attachment filenames are sanitised (path-traversal-safe) and capped by
  `max_attachment_mb` (default 25 MB).
- Extend the loop body with an IDP library activity to parse the saved
  invoices and an Excel/DataFrames activity to log them — see
  `examples/invoice-to-excel` for the parsing half.

This example talks to a real IMAP server, so it is validated but not
executed by CI.
