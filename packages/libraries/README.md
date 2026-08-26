[🇷🇺 Русский](README.ru.md)

# RPAForge Libraries

[![PyPI version](https://badge.fury.io/py/rpaforge-libraries.svg)](https://badge.fury.io/py/rpaforge-libraries)
[![Python Support](https://img.shields.io/pypi/pyversions/rpaforge-libraries.svg)](https://pypi.org/project/rpaforge-libraries/)

RPA automation libraries for RPAForge.

## Included Libraries

| Library | Activities | Description | Status |
|---------|-----------|-------------|--------|
| `DesktopUI` | 20+ | Windows desktop automation (Win32, WPF) | 🟡 In Progress |
| `WebUI` | 15+ | Web automation with Playwright | 🟡 In Progress |
| `Excel` | 8+ | Excel file operations | 🟡 In Progress |
| `DataFrames` | 28+ | Tabular data — filter, sort, join, aggregate (Polars) | ✅ Stable |
| `Database` | 6+ | Database operations with SQLAlchemy | 🟡 In Progress |
| `OCR` | 5+ | Text recognition with Tesseract/EasyOCR | 🟡 In Progress |
| `Credentials` | 4+ | Secure credential management | 🟡 In Progress |
| `File` | 8+ | File and folder operations | 🟡 In Progress |
| `HTTP` | 5+ | REST API requests | 🟡 In Progress |
| `DateTime` | 6+ | Date/time utilities | 🟡 In Progress |
| `String` | 7+ | String manipulation | 🟡 In Progress |
| `Variables` | 4+ | Variable management and scoping | 🟡 In Progress |
| `Flow` | 4+ | Control flow — if, while, for | 🟡 In Progress |
| `Spy` | 3+ | Live UI element inspector overlay | 🟡 In Progress |

## Installation

```bash
# Core libraries (no optional deps)
pip install rpaforge-libraries

# With optional dependencies
pip install rpaforge-libraries[desktop]    # Desktop UI automation (pywinauto)
pip install rpaforge-libraries[web]        # Web UI automation (playwright)
playwright install chromium                # Download browser binaries for WebUI
pip install rpaforge-libraries[ocr]        # OCR support (pytesseract, pyzbar, pyautogui)
pip install rpaforge-libraries[excel]      # Excel operations (openpyxl)
pip install rpaforge-libraries[dataframes] # Tabular data (polars)
pip install rpaforge-libraries[all]        # All dependencies
```

## Usage

### DataFrames

```python
from rpaforge_libraries.DataFrames import DataFrames

df = DataFrames()

# Load data
df.read_csv("sales.csv", frame_name="sales")

# Filter, sort, aggregate
df.filter_rows("sales", "amount", ">", "1000", result_frame="big_sales")
df.sort("big_sales", by=["amount"], descending=True, result_frame="sorted")
total = df.aggregate("sorted", "amount", "sum")

# Export
df.write_csv("sorted", "top_sales.csv")
```

### Desktop UI

```python
from rpaforge_libraries.DesktopUI import DesktopUI

ui = DesktopUI()
ui.open_application("notepad.exe")
ui.wait_for_window("Notepad", timeout="10s")
ui.input_text("Hello from RPAForge!")
ui.close_window()
```

### Web UI

```python
from rpaforge_libraries.WebUI import WebUI

web = WebUI()
web.open_browser("https://example.com/login")
web.input_text("id:username", "myuser")
web.input_text("id:password", "mypass")
web.click_button("id:login-btn")
web.wait_for_page_load()
web.close_browser()
```

### Excel

```python
from rpaforge_libraries.Excel import Excel

xls = Excel()
xls.open_workbook("invoice.xlsx")
data = xls.read_worksheet("Sheet1")
for row in data:
    print(f"Processing: {row['Customer']}")
xls.close_workbook()
```

### OCR

Install the OCR extra and the native Tesseract executable described in the
[OCR library guide](https://github.com/chelslava/rpaforge/blob/main/docs/libraries/ocr.md),
then recognize an image:

```bash
pip install 'rpaforge-libraries[ocr]'
```

```python
from rpaforge_libraries.OCR import OCR

ocr = OCR(lang="eng")
text = ocr.ocr_text_from_image("receipt.png")
print(text)
```

## License

Apache License 2.0
