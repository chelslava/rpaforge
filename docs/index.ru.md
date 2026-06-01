# Добро пожаловать в RPAForge

**RPA Studio с открытым исходным кодом — Визуальный конструктор автоматизации**

RPAForge — мощная и расширяемая студия роботизированной автоматизации процессов (RPA) с современным визуальным интерфейсом.

## Почему RPAForge?

| Функция | Описание |
|---------|-------------|
| 🎨 **Визуальный дизайнер** | Конструктор сценариев автоматизации drag-and-drop — кодирование не требуется |
| 🖥️ **Автоматизация рабочего стола** | Автоматизация приложений Windows (Win32, WPF, Java) |
| 🌐 **Веб-автоматизация** | Современная веб-автоматизация с Playwright |
| 📹 **Умный рекордер** | Запись ваших действий и автоматическое преобразование в сценарии автоматизации |
| 🐛 **Встроенный отладчик** | Точки останова, пошаговое выполнение, инспекция переменных |
| 🔌 **Расширяемость** | Система плагинов для добавления собственной функциональности |

## Быстрый старт

### Установка

```bash
# Установите основной пакет и библиотеки
pip install rpaforge-core rpaforge-libraries
```

### Пример использования

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

# Создайте движок и зарегистрируйте библиотеку
engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

# Создайте процесс
builder = engine.create_process("Привет, мир")
builder.add_task("Автоматизация Notepad", [
    ("DesktopUI.Open Application", {"executable": "notepad.exe"}),
    ("DesktopUI.Wait For Window", {"title": "Notepad", "timeout": "10s"}),
    ("DesktopUI.Input Text", {"text": "Привет от RPAForge!"}),
    ("DesktopUI.Close Window", {}),
])

# Запустите процесс
result = engine.run(builder.build())
print(f"Статус: {result.status}")
```

### Использование Studio UI

Для визуального редактора используйте RPAForge Studio:

```bash
# Клонируйте репозиторий и установите
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Установите зависимости
pip install -e packages/core
pip install -e packages/libraries
cd packages/studio && pnpm install

# Запустите Studio в режиме разработки
pnpm dev
```

## Возможности

### Визуальный конструктор процессов

Визуально проектируйте сценарии автоматизации с помощью интерфейса drag-and-drop. Никакого опыта кодирования не требуется.

![Конструктор процессов](assets/designer.png)

### Умный рекордер

Записывайте свои ручные действия, и RPAForge автоматически преобразует их в переиспользуемые сценарии автоматизации.

### Встроенный отладчик

Отлаживайте свои сценарии автоматизации с помощью точек останова, инспекции переменных и пошагового выполнения.

### Кроссплатформенные библиотеки

- **DesktopUI**: Автоматизация Windows с pywinauto
- **WebUI**: Автоматизация браузера с Playwright
- **OCR**: Распознавание текста с Tesseract
- **Excel**: Автоматизация электронных таблиц
- **Database**: SQL-операции

## Лицензия

RPAForge выпущен под лицензией [Apache License 2.0](https://github.com/chelslava/rpaforge/blob/main/LICENSE).

## Спонсоры

Рассмотрите возможность спонсирования проекта для поддержки его дальнейшей разработки.

[![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/chelslava)

[🇬🇧 English](index.md)
