[🇬🇧 English](README.md)

# RPAForge Core

[![PyPI version](https://badge.fury.io/py/rpaforge-core.svg)](https://badge.fury.io/py/rpaforge-core)
[![Python Support](https://img.shields.io/pypi/pyversions/rpaforge-core.svg)](https://pypi.org/project/rpaforge-core/)
[![License](https://img.shields.io/github/license/chelslava/rpaforge)](LICENSE)

Основной движок RPAForge — нативное выполнение Python с полной поддержкой отладки, записи и IPC-моста.

## Установка

```bash
pip install rpaforge-core
```

## Использование

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

builder = engine.create_process("Notepad Automation")
builder.add_task(
    "Open and Type",
    [
        ("DesktopUI.Open Application", {"executable": "notepad.exe"}),
        ("DesktopUI.Wait For Window", {"title": "Notepad", "timeout": "10s"}),
        ("DesktopUI.Input Text", {"text": "Hello from RPAForge!"}),
        ("DesktopUI.Close Window", {}),
    ],
)

result = engine.run(builder.build())
print(f"Status: {result.status}")
```

## Возможности

- **Движок**: Нативное выполнение Python с валидацией топологии и генерацией кода
- **Отладчик**: Точки останова, пошаговое выполнение (с обходом/входом/выходом), инспектор переменных, стек вызовов
- **Рекордер**: Запись действий пользователя в диаграммы автоматизации
- **IPC-мост**: Asyncio JSON-RPC сервер для взаимодействия Electron ↔ Python

## Разработка

```bash
# Установка в режиме разработки
pip install -e .

# Запуск тестов
pytest tests/ -v

# Форматирование кода
ruff format src/
```

## Лицензия

Apache License 2.0
