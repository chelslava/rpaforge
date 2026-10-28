# Notifications Library

The **Notifications** library delivers process outcomes to humans: HTTP webhooks (Slack, Teams, custom endpoints) and plain-text email over SMTP.

No optional extra is required — the library is part of the base `rpaforge-libraries` install.

## Overview

- **Notify** posts a JSON body to any http(s) webhook with timeout, retry and exponential backoff.
- **Send Email** sends plain-text mail with attachments over STARTTLS or implicit TLS.

Both activities treat credentials as **secrets**: parameters typed `secret` are masked in logs, and SMTP passwords must be passed as a **secret reference** — inline passwords are rejected. A reference has the form `<provider>://<namespace>/<key>` and resolves through the pluggable [Credentials](credentials.md) secret providers (env, keyring, Vault, AWS, Azure).

---

## Activities Reference

| Activity | Parameters | Returns | Description |
|---|---|---|---|
| **Notify** | `webhook_url` *(secret)*, `message`, `payload` (optional dict), `timeout`, `max_retries`, `backoff_base` | `dict` with `status`, `attempts`, HTTP status code | POSTs the message (plus optional extra JSON fields) to a webhook endpoint. |
| **Send Email** | `smtp_host`, `port`, `username_secret`, `password_secret_ref` *(secret ref, mandatory)*, `to`, `subject`, `body`, `attachments`, `use_tls`, `use_ssl` | `dict` with `status`, recipients, attachment count, TLS mode | Sends a plain-text email, optionally with file attachments. |

- `use_tls` (STARTTLS upgrade) and `use_ssl` (implicit TLS) are mutually exclusive.
- `backoff_base` doubles on every retry, so retries pace themselves instead of hammering the endpoint.

---

## Example

```python
from rpaforge_libraries.Notifications.library import Notifications

notify = Notifications()

notify.notify(
    webhook_url="https://hooks.example.com/services/...",
    message="Invoice batch finished",
    payload={"processed": 42, "failed": 0},
)

notify.send_email(
    smtp_host="smtp.example.com",
    username_secret="env://smtp/username",
    password_secret_ref="env://smtp/password",
    to=["ops@example.com"],
    subject="RPA run report",
    body="All 42 invoices processed successfully.",
    attachments=["output/report.xlsx"],
)
```
