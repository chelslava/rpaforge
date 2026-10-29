# Notifications Library

The **Notifications** library delivers process outcomes to humans: HTTP webhooks (Slack, Teams, custom endpoints) and plain-text email over SMTP.

No optional extra is required — the library is part of the base `rpaforge-libraries` install.

## Overview

- **Notify** posts a JSON body to any http(s) webhook with timeout, retry and exponential backoff.
- **Send Email** sends plain-text mail with attachments over STARTTLS or implicit TLS.

Both activities treat credentials as **secrets**: parameters typed `secret` are masked in logs, and SMTP passwords must be passed as a **secret reference** — inline passwords are rejected. A reference has the form `<provider>://<namespace>/<key>` and resolves through the pluggable [Credentials](credentials.md) secret providers (env, keyring, Vault, AWS, Azure).

## SSRF Guard (Webhook Endpoints)

By default, `Notify` refuses to deliver to **private, loopback, link-local (including the cloud-metadata address `169.254.169.254`), reserved, multicast and unspecified addresses**. The hostname is resolved before delivery and *all* resolved addresses must be public — a crafted diagram cannot probe or exfiltrate into the daemon's internal network or a cloud metadata service.

- **Default**: denylist active everywhere (fail-closed; DNS resolution failure also blocks).
- **Opt-out** for trusted, isolated environments: set `RPAFORGE_WEBHOOK_ALLOW_PRIVATE=1`, or pass `allow_private_addresses=True` programmatically. The environment variable can also disable the guard per run, and the constructor flag `allow_private_addresses=False` force-disables the opt-out for a specific transport.
- The denylist is re-evaluated before **every** attempt (including retries), so a long backoff cannot skip the check on re-resolved DNS.
- Known limitation: the check runs immediately before the connect, so a hostile DNS server could still rebind between check and connect. For untrusted workflows, run the daemon inside a network-restricted environment (Docker network policies, egress firewall) in addition to the guard.

For desktop (Studio) use the guard is effectively invisible — public webhook endpoints (Slack, Teams) resolve to public addresses. For unattended runner deployments the fail-closed default is the important one.

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
