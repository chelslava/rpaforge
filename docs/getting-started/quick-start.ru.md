# Быстрый старт

Это руководство поможет создать вашу первую RPA-автоматизацию с RPAForge менее чем за 5 минут.

## Ваша первая автоматизация рабочего стола

Давайте автоматизируем Блокнот Windows с помощью Python:

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

# Создание движка и регистрация библиотеки
engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

# Создание процесса
builder = engine.create_process("Notepad Automation")
builder.add_task("Open and Type", [
    ("DesktopUI.Open Application", {"executable": "notepad.exe"}),
    ("DesktopUI.Wait For Window", {"title": "Notepad", "timeout": "10s"}),
    ("DesktopUI.Input Text", {"selector": None, "text": "Привет от RPAForge!"}),
    ("DesktopUI.Close Window", {}),
])

# Запуск
result = engine.run(builder.build())
print(f"Status: {result.status}")
```

Сохраните этот код как `notepad_bot.py` и запустите:

```bash
python notepad_bot.py
```

## Ваша первая веб-автоматизация

Давайте автоматизируем веб-поиск:

```python
from rpaforge import StudioEngine
from rpaforge_libraries.WebUI import WebUI

# Создание движка и регистрация библиотеки
engine = StudioEngine()
engine.executor.register_library("WebUI", WebUI())

# Создание процесса
builder = engine.create_process("Web Search")
builder.add_task("Google Search", [
    ("WebUI.Open Browser", {"url": "https://www.google.com"}),
    ("WebUI.Input Text", {"selector": "name:q", "text": "RPAForge Python RPA"}),
    ("WebUI.Press Keys", {"keys": "Enter"}),
    ("WebUI.Wait For Page Load", {}),
    ("WebUI.Take Screenshot", {"filename": "results.png"}),
    ("WebUI.Close Browser", {}),
])

# Запуск
result = engine.run(builder.build())
print(f"Status: {result.status}")
```

## Прямое использование Python API

Вы также можете выполнять действия напрямую:

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

engine = StudioEngine()
desktop = DesktopUI()
engine.executor.register_library("DesktopUI", desktop)

# Открытие приложения напрямую
process_id = desktop.open_application("notepad.exe")
print(f".started process: {process_id}")

# Ожидание окна
desktop.wait_for_window("Notepad", timeout="10s")

# Ввод текста
desktop.input_text(None, "Hello World!")

# Закрытие
desktop.close_window()
```

## Использование Studio UI

Визуальный конструктор предоставляет интерфейс drag-and-drop:

```bash
cd packages/studio
npm install
npm run dev
```

Затем:
1. Перетащите активности из палитры на холст
2. Соедините их, чтобы создать сценарий автоматизации
3. Настройте параметры в панели свойств
4. Нажмите Запустить для выполнения

## Следующие шаги

- Узнайте больше о [Конструкторе процессов](../user-guide/designer.md)
- Изучите [Справочник библиотек](../libraries/index.md)
- Прочитайте [Руководство разработчика](../developer-guide/architecture.md)

[🇬🇧 English](quick-start.md)
