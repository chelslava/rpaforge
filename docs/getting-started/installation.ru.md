# Установка

## Требования к системе

- **Python**: 3.10 или выше
- **Node.js**: 18 или выше (для Studio UI)
- **ОС**: Windows 10/11, Linux, macOS

## Установка основных пакетов

### С помощью pip

```bash
# Основной движок
pip install rpaforge-core

# RPA-библиотеки
pip install rpaforge-libraries

# С дополнительными зависимостями
pip install rpaforge-libraries[desktop]  # Автоматизация UI рабочего стола
pip install rpaforge-libraries[web]      # Автоматизация веб-интерфейса
pip install rpaforge-libraries[ocr]      # Поддержка OCR
pip install rpaforge-libraries[all]      # Все зависимости
```

### Из исходного кода

```bash
# Клонирование репозитория
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Создание виртуального окружения
python -m venv .venv
source .venv/bin/activate  # В Windows: .venv\Scripts\activate

# Установка в режиме разработки
pip install -e packages/core
pip install -e packages/libraries
```

## Установка Studio UI

Studio UI — это десктопное приложение на базе Electron.

```bash
cd packages/studio
npm install
npm run dev
```

## Установка браузеров Playwright

Для веб-автоматизации необходимо установить бинарные файлы браузеров:

```bash
pip install playwright
playwright install
```

## Проверка установки

```python
# test_installation.py
from rpaforge import StudioEngine

engine = StudioEngine()
builder = engine.create_process("Test Process")
builder.add_task("Test", [
    ("Log", ["RPAForge работает!"]),
])
result = engine.run(builder.build())
print(f"Status: {result.status}")
```

Запустите тест:

```bash
python test_installation.py
# Ожидаемый вывод: Status: pass
```

## Устранение проблем

### Проблемы установки pywinauto (Windows)

Если при установке pywinauto возникают проблемы:

```bash
# Установите Visual C++ Build Tools
# Скачать можно здесь: https://visualstudio.microsoft.com/visual-cpp-build-tools/

pip install pywinauto
```

### Проблемы с браузерами Playwright

```bash
# Установка с зависимостями
playwright install-deps

# Или для конкретного браузера
playwright install chromium
```

## Следующие шаги

- [Руководство по быстрому старту](quick-start.md)
- [Создание первого бота](first-bot.md)

[🇬🇧 English](installation.md)
