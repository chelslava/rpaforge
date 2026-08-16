# Queues Library

The **Queues** library provides transactional work queue management for building resilient Dispatcher and Performer robotic workflows.

## Overview

Work Queues decouple data ingestion from execution, enabling parallel workers, automatic retry with exponential backoff, dead-letter tracking, and transactional execution guarantees.

### Key Concepts
- **Dispatcher Pattern**: A workflow that ingests items (e.g. from an API, database, or email) and pushes them to a named queue via `Add Queue Item` or `Add Queue Items Bulk`.
- **Performer Pattern**: A worker workflow that processes items one-by-one via `Get Next Item` and marks them as `Successful`, `Failed`, `Retried`, or `Postponed`.
- **Concurrency & Leases**: When a worker claims an item, it acquires an exclusive time-limited lease. If the worker crashes, the lease expires and the item automatically becomes available again.

---

## Activities Reference

| Activity | Parameters | Returns | Description |
|---|---|---|---|
| **Add Queue Item** | `queue_name`, `payload`, `priority` (High/Normal/Low), `reference`, `max_retries`, `defer_until` | `item_id` | Adds a single item to the queue. |
| **Add Queue Items Bulk** | `queue_name`, `items` (List of dicts) | `List[str]` | Adds multiple items in a single transaction. |
| **Get Next Item** | `queue_name`, `lease_duration_sec` | `item` (dict) or `None` | Atomically retrieves and locks the next highest priority item. |
| **Set Item Status** | `item_id`, `status` (`Successful` / `Failed`), `output_data`, `error_message` | `bool` | Updates item state and triggers automatic retry on failure if remaining retries exist. |
| **Postpone Item** | `item_id`, `postpone_until` | `bool` | Temporarily suspends processing until a future timestamp. |
| **Get Queue Metrics** | `queue_name` | `dict` | Returns counts for `new`, `in_progress`, `successful`, `failed`, and `dead_letter` items. |
| **Delete Queue Item** | `item_id` | `bool` | Removes an item permanently from the queue. |
| **Purge Queue** | `queue_name` | `int` | Clears all items in a named queue. |

---

## Example: Dispatcher-Performer Pattern

### Dispatcher Workflow (Python SDK)

```python
from rpaforge_libraries.Queues import Queues

queues = Queues()

invoices = [
    {"invoice_id": "INV-101", "amount": 250.0},
    {"invoice_id": "INV-102", "amount": 1200.0},
]

for inv in invoices:
    item_id = queues.add_queue_item(
        queue_name="Invoices",
        payload=inv,
        priority="High" if inv["amount"] > 1000 else "Normal",
        reference=inv["invoice_id"],
        max_retries=3,
    )
```

### Performer Workflow (Python SDK)

```python
from rpaforge_libraries.Queues import Queues

queues = Queues()

while True:
    item = queues.get_next_item(queue_name="Invoices", lease_duration_sec=60)
    if not item:
        break  # No more work items
    
    try:
        # Process transaction
        invoice_id = item["payload"]["invoice_id"]
        # ... perform automated SAP / Web entry ...
        
        queues.set_item_status(item_id=item["id"], status="Successful", output_data={"sap_doc": "DOC-99182"})
    except Exception as exc:
        queues.set_item_status(item_id=item["id"], status="Failed", error_message=str(exc))
```
