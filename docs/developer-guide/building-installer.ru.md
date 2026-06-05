# Сборка инсталлятора

Этот гайд объясняет, как RPAForge Studio упаковывает Python-движок внутрь
десктопного установщика и как самостоятельно собрать дистрибутив.

## Как движок попадает в сборку

Studio — это Electron-приложение; активности автоматизации выполняет отдельный
**Python-движок**, с которым приложение общается по JSON-RPC через `stdin`/`stdout`.

| Режим | Как запускается мост | Требования |
|-------|----------------------|------------|
| **Разработка** (`pnpm dev`) | `python -m rpaforge.bridge.server` | Python в `PATH`, editable-установка `packages/core` + `packages/libraries` |
| **Production** (установленное приложение) | Замороженный exe в `resources/bridge/rpaforge-bridge.exe` | **Ничего** — движок встроен, конечному пользователю Python не нужен |

В production-режиме движок замораживается через [PyInstaller](https://pyinstaller.org/)
в самодостаточную папку и поставляется через electron-builder
[`extraResources`](https://www.electron.build/configuration/contents#extraresources).
В рантайме `electron/main.ts` (`resolveBridgeLaunchSpec`) определяет упакованную
сборку и запускает этот exe вместо `python -m ...`.

Ключевые файлы:

- `packages/core/rpaforge-bridge.spec` — PyInstaller-спецификация сборки движка.
- `packages/studio/scripts/build-bridge.mjs` — обёртка, которая запускает
  PyInstaller и кладёт результат в `packages/studio/resources/bridge/`.
- `packages/studio/package.json` → `build.extraResources` — копирует движок,
  браузеры Playwright и Tesseract в папку `resources/` установщика.

## Требования для сборки (только машина сборки)

Нужны **только для сборки инсталлятора** — конечному пользователю не требуются.

| Инструмент | Примечание |
|------------|------------|
| Node.js 20+, pnpm 9+ | Сборка Electron |
| Python 3.10–3.13 | Заморозка движка |
| PyInstaller | `pip install pyinstaller` |
| Пакеты движка | `pip install ./packages/core` и нужные extras из `libraries` |

```bash
# Из корня репозитория
pip install pyinstaller
pip install ./packages/core
pip install "./packages/libraries[desktop,web,excel,database,keystore,dataframes]"
pip install pytesseract            # OCR (лёгкий вариант, см. ниже)
```

### Дополнительные бинарники рядом с движком

Некоторым библиотекам нужны бинарники, которых нет в `pip`. Они поставляются
отдельными папками `extraResources` и находятся в рантайме через переменные
среды, выставляемые в `electron/main.ts`:

- **WebUI (Playwright)** — браузеры `pip`-ом не ставятся. Установите Chromium в
  папку bundle:
  ```bash
  PLAYWRIGHT_BROWSERS_PATH="$PWD/packages/studio/resources/pw-browsers" \
    python -m playwright install chromium
  ```
  В рантайме приложение указывает на эту папку через `PLAYWRIGHT_BROWSERS_PATH`.

- **OCR (pytesseract)** — обёртка над нативным `tesseract`. Скопируйте установку
  Tesseract (программу + `tessdata`) в `packages/studio/resources/tesseract/`.
  Приложение добавляет эту папку в `PATH` и выставляет `TESSDATA_PREFIX`.
  > Тяжёлый стек `easyocr`/`torch` намеренно **не** встраивается — OCR-библиотеке
  > достаточно `pytesseract`, и установщик остаётся компактным.

Любая библиотека, чьи зависимости отсутствуют, деградирует мягко: мост пишет
предупреждение, остальные активности продолжают работать.

## Команды сборки

```bash
cd packages/studio

# Заморозить только Python-движок в resources/bridge/
pnpm build:bridge

# Полный дистрибутив: движок + Vite-сборка + установщик electron-builder
pnpm build:dist
```

- `pnpm build` (без `:dist`) собирает **только** Electron-приложение. Если перед
  этим не запустить `pnpm build:bridge`, в установщик попадёт пустая папка
  `resources/bridge/` и активности не загрузятся — для настоящего дистрибутива
  используйте `pnpm build:dist`.
- NSIS-установщик создаётся в `packages/studio/dist-electron/*.exe`.

## Непрерывная интеграция

`.github/workflows/release.yml` выполняет всё вышеописанное автоматически на
`windows-latest` (установка движка + PyInstaller, Playwright Chromium, Tesseract,
затем `pnpm build:bridge` и `pnpm build`) и прикрепляет установщик к GitHub
Release. Запускается тегом `v*.*.*` или кнопкой **Run workflow**
(workflow_dispatch) — учтите, что запуск по тегу/dispatch также публикует
Python-пакеты в PyPI и создаёт GitHub Release.

## Устранение проблем

Если в установленном приложении не загружаются активности, см.
[Установленное приложение: «Не удалось загрузить активности»](../troubleshooting/common-issues.ru.md#установленное-приложение-не-удалось-загрузить-активности).

[🇬🇧 English](building-installer.md)
