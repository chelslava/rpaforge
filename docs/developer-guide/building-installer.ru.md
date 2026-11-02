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
| Python 3.12–3.13 | Заморозка движка |
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

## Автообновление (issue #819)

Собранное приложение проверяет GitHub Releases на обновления через
[electron-updater](https://www.electron.build/auto-update):

- **Источник**: блок `publish: { provider: 'github' }` в
  `packages/studio/package.json` указывает на `chelslava/rpaforge`.
  Релизный job прикрепляет к Release `latest.yml` (electron-builder
  генерирует его рядом с установщиком) и `.exe.blockmap` — именно их
  читает обновлятор. `RPAFORGE_UPDATE_FEED_URL` подменяет источник на
  произвольный статический HTTP-сервер (зеркала, E2E-тесты).
- **Расписание**: одна проверка ~10 секунд после запуска (только в
  упакованных сборках) плюс ручная «Проверить обновления» в
  Настройки → Обновления и в диалоге Помощи.
- **Каналы**: `stable` (по умолчанию) следует `latest.yml`;
  `pre-release` включает `allowPrerelease`/`channel: beta` —
  предлагаются и пре-релизные Releases. Выбор сохраняется в
  `%APPDATA%/RPAForge Studio/update-channel.json`.
- **Поток**: `autoDownload = true` (фоновая загрузка с прогрессом в
  Настройках) и `autoInstallOnAppQuit = true` — загруженное обновление
  применяется при выходе пользователя или сразу через «Перезапустить
  и установить».

### Целостность обновлений

Каждый файл в `latest.yml` несёт `sha512`, зафиксированный при сборке;
electron-updater не поставит загрузку с несовпадающим хешем. Сам
`latest.yml` защищён TLS GitHub и правом записи в репозиторий — тот,
кто может его изменить, уже может изменить и сам Release.
`SHA256SUMS-installer.txt` и sigstore-аттестация (выше) покрывают путь
ручного скачивания.

### E2E-процедура автообновления

E2E-тест постановки обновления (`packages/studio/e2e/update.spec.ts`)
включается переменной `RPAFORGE_UPDATE_FEED_URL`, чтобы постоянный
упакованный E2E-сьют оставался быстрым и без сети. Локальный запуск:

```bash
cd packages/studio
pnpm build

# 1. Реальный sha512 тестируемого установщика:
sha512sum dist-electron/RPAForge.Studio.Setup.<версия>.exe

# 2. Напишите вручную dist-electron/update-feed/latest.yml с той же
#    версией, что у установщика, но завышённым номером версии:
#
#    version: 999.0.0
#    path: RPAForge.Studio.Setup.<версия>.exe
#    sha512: <хеш из шага 1>
#    releaseDate: '<now>'
#
# 3. Скопируйте установщик рядом и поднимите сервер:
cp dist-electron/RPAForge.Studio.Setup.<версия>.exe dist-electron/update-feed/
cd dist-electron/update-feed && python -m http.server 9000

# 4. В другом терминале:
RPAFORGE_UPDATE_FEED_URL=http://127.0.0.1:9000 pnpm exec playwright test e2e/update.spec.ts
```

Тест проходит, когда в кеше обновлятора
(`%LOCALAPPDATA%/<имя>-updater/pending/`) появляется установщик.

## Устранение проблем

Если в установленном приложении не загружаются активности, см.
[Установленное приложение: «Не удалось загрузить активности»](../troubleshooting/common-issues.ru.md#установленное-приложение-не-удалось-загрузить-активности).

[🇬🇧 English](building-installer.md)
