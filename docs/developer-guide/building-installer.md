# Building the Installer

This guide explains how RPAForge Studio ships its Python engine inside the
desktop installer, and how to build a distributable installer yourself.

## How the engine is bundled

Studio is an Electron app; the automation activities run in a separate **Python
engine** that the app talks to over a JSON-RPC bridge (`stdin`/`stdout`).

| Mode | How the bridge starts | Requirements |
|------|----------------------|--------------|
| **Development** (`pnpm dev`) | `python -m rpaforge.bridge.server` | Python on `PATH`, editable install of `packages/core` + `packages/libraries` |
| **Production** (installed app) | A frozen executable at `resources/bridge/rpaforge-bridge.exe` | **None** — the engine is bundled, end users need no Python |

For production the engine is frozen with [PyInstaller](https://pyinstaller.org/)
into a self-contained folder and shipped via electron-builder
[`extraResources`](https://www.electron.build/configuration/contents#extraresources).
At runtime `electron/main.ts` (`resolveBridgeLaunchSpec`) detects the packaged
build and spawns that executable instead of `python -m ...`.

Key files:

- `packages/core/rpaforge-bridge.spec` — PyInstaller build spec for the engine.
- `packages/studio/scripts/build-bridge.mjs` — wrapper that runs PyInstaller and
  places the output in `packages/studio/resources/bridge/`.
- `packages/studio/package.json` → `build.extraResources` — copies the engine,
  Playwright browsers, and Tesseract into the installer's `resources/` folder.

## Build prerequisites (build machine only)

These are needed **only to build an installer** — not by end users.

| Tool | Notes |
|------|-------|
| Node.js 20+, pnpm 9+ | Electron build |
| Python 3.10–3.13 | Freezes the engine |
| PyInstaller | `pip install pyinstaller` |
| Engine packages | `pip install ./packages/core` and the `libraries` extras you want bundled |

```bash
# From the repo root
pip install pyinstaller
pip install ./packages/core
pip install "./packages/libraries[desktop,web,excel,database,keystore,dataframes]"
pip install pytesseract            # OCR (lightweight; see note below)
```

### Optional tooling bundled alongside the engine

Some libraries need binaries that `pip` does not provide. They are shipped as
separate `extraResources` folders and located at runtime via environment
variables set in `electron/main.ts`:

- **WebUI (Playwright)** — browsers are not installed by `pip`. Install Chromium
  into the bundle folder:
  ```bash
  PLAYWRIGHT_BROWSERS_PATH="$PWD/packages/studio/resources/pw-browsers" \
    python -m playwright install chromium
  ```
  At runtime the app sets `PLAYWRIGHT_BROWSERS_PATH` to this folder.

- **OCR (pytesseract)** — wraps the native `tesseract` binary. Copy a Tesseract
  install (program + `tessdata`) into `packages/studio/resources/tesseract/`.
  The app prepends this folder to `PATH` and sets `TESSDATA_PREFIX` at runtime.
  > The heavier `easyocr`/`torch` stack is intentionally **not** bundled — the
  > OCR library only needs `pytesseract`, which keeps the installer small.

Any library whose dependencies are absent simply degrades gracefully: the bridge
logs a warning and the rest of the activities keep working.

## Build commands

```bash
cd packages/studio

# Freeze only the Python engine into resources/bridge/
pnpm build:bridge

# Full distributable: engine + Vite build + electron-builder installer
pnpm build:dist
```

- `pnpm build` (without `:dist`) builds **only** the Electron app. If you have not
  run `pnpm build:bridge` first, the installer ships an empty `resources/bridge/`
  and activities will not load — use `pnpm build:dist` for a real distributable.
- The NSIS installer is written to `packages/studio/dist-electron/*.exe`.

## Continuous integration

`.github/workflows/release.yml` performs all of the above automatically on
`windows-latest` (install engine + PyInstaller, Playwright Chromium, Tesseract,
then `pnpm build:bridge` and `pnpm build`) and attaches the installer to the
GitHub Release. Trigger it via a `v*.*.*` tag or the **Run workflow**
(workflow_dispatch) button — note that a dispatch/tag run also publishes the
Python packages to PyPI and creates a GitHub Release.

## Troubleshooting

If activities fail to load in the installed app, see
[Installed App: "Failed to load activities"](../troubleshooting/common-issues.md#installed-app-failed-to-load-activities).

[🇷🇺 Русский](building-installer.ru.md)
