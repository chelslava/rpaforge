# Core API Reference

The RPAForge Core SDK provides native Python APIs for building custom libraries, orchestrating work queues, resolving multi-strategy selectors, managing pluggable secrets, and creating signed packages.

---

## 1. Activity & Library Decorators (`rpaforge.core.activity`)

Define custom activities and libraries with typed schema reflection:

```python
from rpaforge.core.activity import library, activity, param

@library(name="Accounting", category="Finance")
class AccountingLibrary:
    @activity(name="Calculate Tax", category="Finance")
    @param("subtotal", type="number", description="Gross order subtotal")
    @param("tax_rate", type="number", default=0.20, description="Applicable VAT rate")
    def calculate_tax(self, subtotal: float, tax_rate: float = 0.20) -> dict:
        tax_amount = round(subtotal * tax_rate, 2)
        return {"tax_amount": tax_amount, "total": subtotal + tax_amount}
```

---

## 2. Transaction Work Queue Engine (`rpaforge.queues`)

Transactional queue engine for Dispatcher-Performer workflows with optimistic concurrency and lease management:

```python
from rpaforge.queues import WorkQueueEngine, SQLiteQueueStore

store = SQLiteQueueStore("work_queues.db")
engine = WorkQueueEngine(store=store)

# Enqueue
item_id = engine.add_item(
    queue_name="Invoices",
    payload={"invoice_num": 1042, "vendor": "Acme Corp"},
    priority=10, # High priority
    max_retries=3,
)

# Acquire next item with 60s lease
item = engine.get_next_item("Invoices", lease_duration_sec=60)
if item:
    try:
        # Perform work...
        engine.set_status(item.id, status="Successful", output_data={"doc_id": "991"})
    except Exception as exc:
        engine.set_status(item.id, status="Failed", error_message=str(exc))
```

---

## 3. Multi-Strategy Smart Selectors (`rpaforge.selectors`)

Robust UI targeting with fallback chains and confidence scoring:

```python
from rpaforge.selectors import SmartSelectorEngine, TargetElement

engine = SmartSelectorEngine()

selector = {
    "strategies": [
        {"type": "css", "value": "button.submit-order"},
        {"type": "xpath", "value": "//button[contains(text(), 'Place Order')]"},
        {"type": "text_anchor", "label": "Total:", "direction": "below"},
        {"type": "image_template", "template_path": "assets/btn_submit.png", "threshold": 0.85}
    ]
}

# Resolve target with highest confidence
target = engine.resolve_target(selector, context=driver_or_page)
print(f"Target matched via {target.matched_strategy} with score {target.confidence_score}")
```

---

## 4. Pluggable Secret Providers (`rpaforge.credentials.providers`)

Integrate external enterprise key vaults and environment secrets:

```python
from rpaforge.credentials import CredentialsManager
from rpaforge.credentials.providers import (
    VaultSecretProvider,
    AwsSecretProvider,
    AzureSecretProvider,
    DotenvSecretProvider,
)

manager = CredentialsManager()
manager.register_provider("vault", VaultSecretProvider(url="https://vault.corp:8200", token="..."))
manager.register_provider("aws", AwsSecretProvider(region_name="us-east-1"))
manager.register_provider("env", DotenvSecretProvider(".env.production"))

# Retrieve secret securely with automatic memory scrubbing
secret_val = manager.get_secret("db_password", provider="vault")
```

---

## 5. Project Packaging & Verification (`rpaforge.packaging`)

Create and verify sealed `.forge` automation archives:

```python
from rpaforge.packaging import ForgePackageBuilder, load_forge_package

# Build package
builder = ForgePackageBuilder(project_dir="./my_project")
package_path = builder.build(output_path="./dist/workflow.forge")

# Load and verify integrity
package = load_forge_package(package_path)
assert package.verify_checksum(), "Package integrity check failed"
print(f"Loaded {package.manifest.name} v{package.manifest.version}")
```
