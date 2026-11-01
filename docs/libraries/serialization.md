# Serialization Library

The **Serialization** library covers the everyday structured-data plumbing RPA processes need: JSON files and dot-path access, XML round-trips, CSV writing and ZIP archives.

No optional extra is required — the library is stdlib-only (`json`, `xml.etree`, `csv`, `zipfile`) and ships with the base `rpaforge-libraries` install.

## Overview

- **JSON**: read/write files plus `Get/Set JSON Value` with dot paths (`users.0.email`). `Set` returns a copy — the input dict is never mutated; missing intermediate keys are created on demand.
- **XML**: `XML to Dict` / `Dict to XML` round-trip with the `@attribute` / `#text` convention (repeated elements become lists).
- **CSV**: `Write CSV` takes a list of dicts, writes a header from the first row's keys and quotes through Python's `csv` dialect.
- **ZIP**: `Zip Files` / `Unzip Archive` with **path-traversal protection** (see below).

---

## Activities Reference

| Activity | Parameters | Returns | Description |
|---|---|---|---|
| **Read JSON** | `path` | parsed data | Reads and parses a JSON file. |
| **Write JSON** | `path`, `data`, `indent` | file path | Serializes data as UTF-8 JSON (indent 0 = compact). |
| **Get JSON Value** | `data`, `path`, `default` | value | Dot-path lookup (`orders.0.reference`); `default` on a missing path. |
| **Set JSON Value** | `data`, `path`, `value` | modified copy | Dot-path assignment; input is never mutated. |
| **XML to Dict** | `path` | dict | Parses XML (`@attr`, `#text`, repeated elements as lists). |
| **Dict to XML** | `data`, `path` | file path | Inverse of XML to Dict; expects a single root key. |
| **Write CSV** | `path`, `rows`, `delimiter`, `include_headers` | file path | Writes a list of dicts as CSV (UTF-8). |
| **Zip Files** | `paths`, `archive_path` | archive path | Archives the given files (deflate). |
| **Unzip Archive** | `archive_path`, `dest_dir` | dest dir | Extracts with path-traversal protection. |

---

## ZIP Path-Traversal Protection

`Unzip Archive` is hardened against malicious archives ("zip slips"): every member path is normalized (backslashes → slashes) and rejected if it is absolute, carries a drive-letter target, or contains any `..` segment. Additionally, each resolved target must stay inside the destination directory, and **one poisoned member rejects the whole archive** before anything is extracted (fail-closed).

```python
from rpaforge_libraries.Serialization.library import Serialization

serialization = Serialization()
serialization.unzip_archive("downloads/report.zip", "output/")
# SerializationError: ... contains an unsafe member path: ../outside.txt
```

---

## Example: Invoice export pipeline

```python
from rpaforge_libraries.Serialization.library import Serialization

serialization = Serialization()

invoice = serialization.read_json("data/invoice.json")
updated = serialization.set_json_value(invoice, "status", "archived")
serialization.write_json("archive/invoice.json", updated)
serialization.write_csv("archive/lines.csv", updated["line_items"])
serialization.zip_files(
    ["archive/invoice.json", "archive/lines.csv"],
    "archive/invoice_bundle.zip",
)
```
