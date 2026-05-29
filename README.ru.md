<div align="center">

<img src="docs/assets/logo.png" alt="Логотип RPAForge" width="166" height="619" />

# RPAForge

**Open-Source RPA Studio — Визуальная автоматизация для разработчиков**

[![CI](https://github.com/chelslava/rpaforge/actions/workflows/ci.yml/badge.svg)](https://github.com/chelslava/rpaforge/actions/workflows/ci.yml)
[![PyPI version](https://badge.fury.io/py/rpaforge-core.svg)](https://pypi.org/project/rpaforge-core/)
[![Python](https://img.shields.io/pypi/pyversions/rpaforge-core)](https://pypi.org/project/rpaforge-core/)
[![License](https://img.shields.io/github/license/chelslava/rpaforge)](LICENSE)
[![codecov](https://codecov.io/gh/chelslava/rpaforge/branch/main/graph/badge.svg)](https://codecov.io/gh/chelslava/rpaforge)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Быстрый старт](#быстрый-старт) · [Документация](#документация) · [Библиотеки](#rpa-библиотеки) · [Дорожная карта](#дорожная-карта) · [Участие в проекте](#участие-в-проекте)

[🇬🇧 English](README.md)

</div>

---

RPAForge — современная open-source **студия роботизированной автоматизации процессов (RPA)**. Проектируйте сценарии автоматизации визуально, отлаживайте их пошагово и запускайте с производительным Python-движком — без привязки к вендору и лицензионных сборов.

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

builder = engine.create_process("Notepad Automation")
builder.add_task("Open and Type", [
    ("DesktopUI.Open Application",  {"executable": "notepad.exe"}),
    ("DesktopUI.Wait For Window",   {"title": "Notepad", "timeout": "10s"}),
    ("DesktopUI.Input Text",        {"text": "Hello from RPAForge!"}),
    ("DesktopUI.Close Window",      {}),
])

result = engine.run(builder.build())
print(f"Status: {result.status}")
```

---

## Возможности

| | |
|---|---|
| **Визуальный дизайнер** | Конструктор процессов с drag-and-drop на базе React Flow — узлы, связи, подсхемы, масштабирование, мини-карта |
| **Встроенный отладчик** | Точки останова, пошаговое выполнение (с обходом/входом/выходом), инспектор переменных, стек вызовов, условные остановки |
| **14 RPA-библиотек** | 80+ готовых действий для Desktop, Web, Excel, DataFrames, базы данных, OCR, HTTP, учётных данных и многого другого |
| **Python Bridge** | Asyncio JSON-RPC сервер — Electron взаимодействует с Python по IPC с полной типобезопасностью |
| **Генерация кода** | Диаграмма → Python, с валидацией топологии перед каждым запуском |
| **Безопасность** | Защита от SQL-инъекций, path traversal, небезопасного `getattr` и валидация IPC-пакетов (v0.3.1) |
| **Постоянное хранилище** | Автосохранение процессов, переменных и истории выполнения в IndexedDB |
| **Кроссплатформенность** | Windows, macOS, Linux — единая кодовая база |

---

## Архитектура

```
┌──────────────────────────────────────────────────────────────────┐
│  RPAForge Studio  (Electron 42 + React 19 + TailwindCSS 4)      │
│                                                                  │
│   Designer │ Debugger │ Console │ Recorder                      │
│   React Flow · Monaco Editor · Zustand · Vite 6                 │
└────────────────────────────┬─────────────────────────────────────┘
                             │  JSON-RPC over IPC / Stdio
┌────────────────────────────┴─────────────────────────────────────┐
│  Python Bridge Server  (asyncio JSON-RPC)                        │
│                                                                  │
│   StudioEngine · ProcessRunner · Debugger · Recorder             │
│   CodeGenerator · Topology Validator                             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│  RPA Libraries  (14 modules · 55+ activities)                    │
│                                                                  │
│  DesktopUI  WebUI   Excel    Database  OCR   Credentials         │
│  File       HTTP    DateTime String    Flow  Variables  Spy …    │
└──────────────────────────────────────────────────────────────────┘
```

### Пакеты

```
rpaforge/
├── packages/
│   ├── core/           # Python-движок — runner, debugger, bridge, codegen
│   ├── libraries/      # Модули RPA-библиотек
│   ├── studio/         # Десктопное приложение Electron + React
│   └── orchestrator/   # Control Tower (планируется)
├── docs/               # Документация MKDocs
├── .github/            # CI/CD workflows (ci, release, codeql, docs)
└── tools/              # Скрипты релиза
```

---

## Быстрый старт

### Требования

| Инструмент | Версия |
|------|---------|
| Python | 3.10 – 3.13 |
| Node.js | 20+ |
| pnpm | 9+ (или npm 9+) |
| Git | любая |
| VS Build Tools | только Windows, для нативных модулей |

### Установка и запуск

```bash
# 1. Клонирование
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# 2. Python-пакеты (режим разработки)
pip install -r requirements-dev.txt
pre-commit install
pip install -e packages/core
pip install -e packages/libraries

# 3. Studio UI
cd packages/studio
pnpm install          # или: npm ci --include=optional

# 4. Проверка
cd ../..
pytest packages/core/tests -v
cd packages/studio && pnpm test && cd ../..
```

### Запуск студии

```bash
cd packages/studio
pnpm dev              # Vite dev server + Electron hot-reload
```

### Системные зависимости

<details>
<summary><b>Linux (Ubuntu/Debian)</b></summary>

```bash
sudo apt-get install -y libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1
```
</details>

<details>
<summary><b>macOS</b></summary>

```bash
xcode-select --install
```
</details>

<details>
<summary><b>Поддержка OCR (все платформы)</b></summary>

```bash
pip install -e "packages/libraries[ocr]"

# Windows: https://github.com/UB-Mannheim/tesseract/wiki
# Linux:   sudo apt-get install tesseract-ocr
# macOS:   brew install tesseract
```
</details>

<details>
<summary><b>Веб-автоматизация (Playwright)</b></summary>

```bash
pip install -e "packages/libraries[web]"
playwright install    # Загружает бинарные файлы браузеров
```
</details>

---

## RPA-библиотеки

| Библиотека | Действия | Описание | Доп. зависимости |
|---------|-----------|-------------|------------|
| **DesktopUI** | 20+ | Автоматизация Windows UI — Win32, WPF, Java | pywinauto, pillow |
| **WebUI** | 15+ | Автоматизация браузеров (Chrome, Firefox, Safari) | playwright |
| **Excel** | 8+ | Чтение/запись XLSX-таблиц | openpyxl |
| **DataFrames** | 28+ | Операции с табличными данными — фильтр, сортировка, объединение, агрегация | polars |
| **Database** | 6+ | SQL-запросы через SQLAlchemy ORM | sqlalchemy |
| **OCR** | 5+ | Распознавание текста — Tesseract + EasyOCR | pytesseract, easyocr |
| **Credentials** | 4+ | Зашифрованное хранилище учётных данных ОС | cryptography, keyring |
| **File** | 8+ | Операции с файлами и папками | — |
| **HTTP** | 5+ | REST API запросы | requests |
| **DateTime** | 6+ | Утилиты для работы с датой и временем | — |
| **String** | 7+ | Манипуляции со строками | — |
| **Variables** | 4+ | Управление переменными и областями видимости | — |
| **Flow** | 4+ | Управление потоком — if, while, for | — |
| **Spy** | 3+ | Инспектор UI-элементов в реальном времени | uiautomation, pynput |

Устанавливайте только необходимое:

```bash
pip install -e "packages/libraries[desktop]"    # DesktopUI
pip install -e "packages/libraries[web]"         # WebUI
pip install -e "packages/libraries[dataframes]"  # DataFrames (polars)
pip install -e "packages/libraries[all]"         # Всё
```

---

## Разработка

### Основные команды

```bash
make test         # Запуск всех Python-тестов
make lint         # ruff + mypy
make format       # ruff format
make docs         # Сборка MKDocs
make docs-serve   # Локальный сервер документации
make studio-dev   # Studio hot-reload

cd packages/studio
pnpm test         # Vitest
pnpm build        # Продакшен-сборка
```

### Технологический стек

**Backend (Python)**
- `asyncio` JSON-RPC мост
- `ruff` для линтинга и форматирования
- `pytest` + `pytest-asyncio` для тестирования
- `mypy` для проверки типов

**Frontend (TypeScript)**
- React 19 + Vite 6
- React Flow 11 — визуальный редактор диаграмм
- Zustand 5 — управление состоянием
- Monaco Editor — встроенный редактор кода
- TailwindCSS 4 — утилитарные стили
- Electron 42 — упаковка в десктопное приложение

---

## Статус проекта

| Пакет | Описание | Версия | Статус |
|---------|-------------|---------|--------|
| `rpaforge-core` | Движок, отладчик, JSON-RPC мост | v0.3.3 | ✅ Стабильный |
| `rpaforge-libraries` | 14 RPA-библиотек | v0.3.3 | ✅ Стабильный |
| `rpaforge-studio` | Electron + React десктопный UI | v0.3.3 | 🔄 Альфа |
| `rpaforge-orchestrator` | Центр управления | — | 🔜 Планируется |

---

## Дорожная карта

### v0.3.1 — Безопасность и стабильность *(выпущена)*
- ✅ Защита от SQL-инъекций, path traversal, небезопасного `getattr`
- ✅ Валидация IPC-пакетов со строгим соблюдением схемы
- ✅ Инфраструктура IndexedDB — автосохранение, переменные, история
- ✅ Встроенная Python-валидация на базе Ruff с подсветкой ошибок
- ✅ Постоянное логирование с ротацией файлов
- ✅ Режим заморозки для оверлея Spy

### v0.3.2 — Надёжность *(выпущена)*
- ✅ Сериализованная блокировка жизненного цикла для `_handle_run_diagram` — устранение состояний гонки при параллельном выполнении
- ✅ Безопасное разрешение пути к `ruff` через `shutil.which()`
- ✅ Аудит безопасности зависимостей — устранено 14 предупреждений Dependabot через npm overrides

### v0.3.3 — DataFrames и улучшение отладки *(текущая)*
- ✅ **Библиотека DataFrames** — 28 действий для табличных данных на базе Polars (загрузка, фильтрация, сортировка, объединение, агрегация и другое)
- ✅ **Тип переменной DataFrame** — первоклассный тип `dataframe` в визуальном дизайнере
- ✅ **Визуальный просмотр таблиц в отладчике** — просмотр содержимого DataFrame в точке останова
- ✅ Исправления i18n — все строки UI переведены на английский и русский

### v0.4.0 — Расширенные сценарии *(планируется)*
- [ ] Умный рекордер действий — запись и воспроизведение действий пользователя
- [ ] Извлечение селекторов и самовосстанавливающиеся локаторы
- [ ] Улучшения панели «Обозреватель переменных»
- [ ] Браузер истории выполнения
- [ ] UI для маппинга параметров подсхем

### v0.5.0 — Расширяемость *(Q4 2026)*
- [ ] Система плагинов и SDK для разработки библиотек
- [ ] Маркетплейс шаблонов проектов
- [ ] Интеграция с системой контроля версий (git-aware projects)

### v1.0.0 — Готовность к продакшену *(Q1 2027)*
- [ ] Оркестратор — Control Tower для выполнения на нескольких машинах
- [ ] Планировщик и движок триггеров
- [ ] Расширенный мониторинг и оповещения
- [ ] Корпоративная аутентификация (LDAP/SSO)

---

## Документация

| Ресурс | Описание |
|----------|-------------|
| [Начало работы](docs/getting-started/installation.md) | Установка и настройка системы |
| [Быстрый старт](docs/getting-started/quick-start.md) | Создайте свою первую автоматизацию |
| [Руководство разработчика](AGENTS.md) | Архитектура, паттерны, соглашения по коду |
| [Участие в проекте](CONTRIBUTING.md) | Как вносить вклад в код или документацию |
| [Журнал изменений](CHANGELOG.md) | Примечания к выпускам |
| [Дорожная карта](ROADMAP.md) | Детальная дорожная карта функций |

---

## Участие в проекте

Приветствуются любые вклады — сообщения об ошибках, запросы новых функций, документация и код.

```bash
# Fork → clone → branch
git checkout -b feat/my-feature

# Внесите изменения, затем
make test && make lint

# Коммит (Conventional Commits)
git commit -m "feat(libraries): add PDF extraction keyword"

# Откройте PR в main
```

Смотрите [CONTRIBUTING.md](CONTRIBUTING.md) для ознакомления с полным процессом, стандартами кодирования и чек-листом PR.

---

## Благодарности

- Визуальный дизайнер на базе [React Flow](https://reactflow.dev/) и [Electron](https://www.electronjs.org/)
- Автоматизация рабочего стола через [pywinauto](https://pywinauto.readthedocs.io/)
- Веб-автоматизация через [Playwright](https://playwright.dev/)
- Вдохновение от UiPath, Blue Prism и Automation Anywhere

---

<div align="center">

**[GitHub Discussions](https://github.com/chelslava/rpaforge/discussions) · [Трекер задач](https://github.com/chelslava/rpaforge/issues)**

Apache License 2.0 — Создано с заботой сообществом RPAForge

</div>
