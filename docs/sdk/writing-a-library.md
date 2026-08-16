# Writing a Custom RPAForge Library

This guide walks you through creating, packaging, and publishing custom RPAForge libraries for third-party automation tasks.

## Overview

RPAForge uses standard Python package entry points (`[project.entry-points."rpaforge.libraries"]`) to discover libraries at runtime. Third-party packages require zero modifications to `rpaforge-core`.

## Project Structure

A typical custom library project structure:

```text
my-rpaforge-library/
├── pyproject.toml
├── src/
│   └── my_library/
│       ├── __init__.py
│       └── core.py
└── tests/
    └── test_library.py
```

## Step 1: Write the Library Code

Use `@library`, `@activity`, and `@param` decorators from `rpaforge.core.activity`:

```python
# src/my_library/core.py
from __future__ import annotations

from typing import Any
from rpaforge.core.activity import activity, library, param


@library(name="PDFUtility", category="Document Automation")
class PDFUtilityLibrary:
    """Library for extracting and manipulating PDF documents."""

    @activity(name="Extract Text", category="PDF Operations")
    @param("pdf_path", type="string", description="Absolute file path to the PDF.")
    @param("page_number", type="integer", description="1-based page number to extract (default 1).")
    def extract_text(self, pdf_path: str, page_number: int = 1) -> dict[str, Any]:
        """Extracts text content from the specified page of a PDF document."""
        # Custom implementation here
        return {"text": f"Sample extracted text from page {page_number} of {pdf_path}"}
```

## Step 2: Configure Package Entry Points

In your `pyproject.toml`, register your library class under entry point group `"rpaforge.libraries"`:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "rpaforge-pdfutility"
version = "0.1.0"
description = "PDF document processing library for RPAForge Studio"
dependencies = [
    "rpaforge-core>=0.4.0",
]

[project.entry-points."rpaforge.libraries"]
PDFUtility = "my_library.core:PDFUtilityLibrary"
```

## Step 3: Register and Test Locally

Install your package in development mode:

```bash
pip install -e .
```

Verify that RPAForge engine discovers your library:

```python
from rpaforge import StudioEngine

engine = StudioEngine()
activities = engine.get_activities()
print([act for act in activities if act["library"] == "PDFUtility"])
```

## Step 4: Publish to PyPI

Once tested, build and publish your library package to PyPI:

```bash
python -m build
python -m twine upload dist/*
```
