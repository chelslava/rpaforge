[🇬🇧 English](README.md)

# RPAForge Libraries

[![PyPI version](https://badge.fury.io/py/rpaforge-libraries.svg)](https://badge.fury.io/py/rpaforge-libraries)
[![Python Support](https://img.shields.io/pypi/pyversions/rpaforge-libraries.svg)](https://pypi.org/project/rpaforge-libraries/)

RPA-библиотеки автоматизации для RPAForge.

## Состав библиотек

| Библиотека | Действия | Описание | Статус |
|---------|-----------|-------------|--------|
| `DesktopUI` | 20+ | Автоматизация Windows Desktop (Win32, WPF) | 🟡 В разработке |
| `WebUI` | 15+ | Веб-автоматизация через Playwright | 🟡 В разработке |
| `Excel` | 8+ | Операции с Excel-файлами | 🟡 В разработке |
| `DataFrames` | 28+ | Табличные данные — фильтр, сортировка, объединение, агрегация (Polars) | ✅ Стабильный |
| `Database` | 6+ | Операции с базами данных через SQLAlchemy | 🟡 В разработке |
| `OCR` | 5+ | Распознавание текста через Tesseract/EasyOCR | 🟡 В разработке |
| `Credentials` | 4+ | Безопасное управление учётными данными | 🟡 В разработке |
| `File` | 8+ | Операции с файлами и папками | 🟡 В разработке |
| `HTTP` | 5+ | REST API запросы | 🟡 В разработке |
| `DateTime` | 6+ | Утилиты для работы с датой и временем | 🟡 В разработке |
| `String` | 7+ | Манипуляции со строками | 🟡 В разработке |
| `Variables` | 4+ | Управление переменными и областями видимости | 🟡 В разработке |
| `Flow` | 4+ | Управление потоком — if, while, for | 🟡 В разработке |
| `Spy` | 3+ | Инспектор UI-элементов в реальном времени | 🟡 В разработке |

## Установка

```bash
# Базовые библиотеки (без опциональных зависимостей)
pip install rpaforge-libraries

# С опциональными зависимостями
pip install rpaforge-libraries[desktop]    # Автоматизация Desktop UI (pywinauto)
pip install rpaforge-libraries[web]        # Автоматизация Web UI (playwright)
pip install rpaforge-libraries[ocr]        # Поддержка OCR (pytesseract, pyzbar, pyautogui)
pip install rpaforge-libraries[excel]      # Операции с Excel (openpyxl)
pip install rpaforge-libraries[dataframes] # Табличные данные (polars)
pip install rpaforge-libraries[all]        # Все зависимости
```

## Использование

### DataFrames

```python
from rpaforge_libraries.DataFrames import DataFrames

df = DataFrames()

# Загрузка данных
df.read_csv("sales.csv", frame_name="sales")

# Фильтрация, сортировка, агрегация
df.filter_rows("sales", "amount", ">", "1000", result_frame="big_sales")
df.sort("big_sales", by=["amount"], descending=True, result_frame="sorted")
total = df.aggregate("sorted", "amount", "sum")

# Экспорт
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

## Лицензия

Apache License 2.0
