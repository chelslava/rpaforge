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
| Python 3.12–3.13 | Freezes the engine |
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

## Release supply-chain artifacts

Every release ships with integrity and provenance artifacts (issue #833):

| Asset | Produced by | What it is |
|---|---|---|
| `sbom-python.cdx.json` | `uv export --format cyclonedx1.5 --all-packages --all-extras` | CycloneDX SBOM of the whole locked Python dependency tree (workspace packages + all extras, torch/pillow included) |
| `sbom-studio.cdx.json` | `pnpm sbom --sbom-format cyclonedx` | CycloneDX SBOM of the Studio npm dependency tree |
| `SHA256SUMS` | build job | SHA-256 checksums for the wheels, sdist tarballs, registry.json and the Python SBOM |
| `SHA256SUMS-installer.txt` | build-electron job | SHA-256 checksums for every attached `.exe` |
| *(PyPI attestations)* | `gh-action-pypi-publish` with `attestations: true` | PEP 740 provenance attestations for the uploaded wheels/sdists, signed with the GitHub Actions OIDC identity |
| *(installer attestation)* | `actions/attest-build-provenance` | A sigstore bundle linking each installer binary to this exact workflow run — no stored secrets |

### Verifying a download

```bash
# 1. Checksums (release assets are flat; run inside a directory with the files)
sha256sum --check SHA256SUMS

# 2. Installer build provenance (sigstore, via GitHub's attestation API)
gh attestation verify RPAForge-Setup-<version>.exe --repo chelslava/rpaforge

# 3. PyPI attestations are displayed on pypi.org under "Attestations" for each
#    file and can be checked with `gh attestation verify <file> -R chelslava/rpaforge`
```

Windows code-signing certificates (Authenticode/EV) are still tracked as
future work. The attestation story above already provides tamper-evidence:
any byte change to an installer invalidates its recorded attestation.

## Auto-update (issue #819)

The packaged app checks GitHub Releases for updates with
[electron-updater](https://www.electron.build/auto-update):

- **Feed**: the `publish: { provider: 'github' }` block in
  `packages/studio/package.json` points at `chelslava/rpaforge`. The
  release job attaches `latest.yml` (generated by electron-builder next to
  the installer) and the `.exe.blockmap` files — these are what the
  updater reads. `RPAFORGE_UPDATE_FEED_URL` overrides the feed with a
  generic static HTTP provider (self-hosted mirrors, E2E testing).
- **Schedule**: one check ~10 seconds after startup (packaged builds
  only) plus a manual "Check for updates" in Settings → Updates and in
  the Help dialog.
- **Channels**: `stable` (default) follows `latest.yml`; `pre-release`
  sets `allowPrerelease`/`channel: beta` so prerelease-tagged Releases
  are offered. The choice persists in
  `%APPDATA%/RPAForge Studio/update-channel.json`.
- **Flow**: `autoDownload = true` (background download with progress in
  the Settings dialog) and `autoInstallOnAppQuit = true` — the staged
  update is applied when the user quits, or immediately via
  "Restart & install".

### Update integrity

Every artifact listed in `latest.yml` carries a `sha512` recorded at
build time; electron-updater refuses to stage a download that does not
match. `latest.yml` itself is protected by GitHub TLS and by repo write
access — anyone able to modify it could already modify the Release it
describes. `SHA256SUMS-installer.txt` and the sigstore build attestation
(above) cover the manual-download path.

### Auto-update E2E procedure

The staged-download E2E (`packages/studio/e2e/update.spec.ts`) is gated
behind `RPAFORGE_UPDATE_FEED_URL` so the always-on packaged E2E smoke
suite stays fast and network-free. To run it against a local build:

```bash
cd packages/studio
pnpm build

# 1. Compute the real sha512 of the installer under test:
sha512sum dist-electron/RPAForge.Studio.Setup.<version>.exe

# 2. Hand-write dist-electron/update-feed/latest.yml pointing at the same
#    installer with a bumped version:
#
#    version: 999.0.0
#    path: RPAForge.Studio.Setup.<version>.exe
#    sha512: <hash from step 1>
#    releaseDate: '<now>'
#
# 3. Copy the installer into the same directory and serve it:
cp dist-electron/RPAForge.Studio.Setup.<version>.exe dist-electron/update-feed/
cd dist-electron/update-feed && python -m http.server 9000

# 4. In another terminal:
RPAFORGE_UPDATE_FEED_URL=http://127.0.0.1:9000 pnpm exec playwright test e2e/update.spec.ts
```

The test passes when the updater cache
(`%LOCALAPPDATA%/<name>-updater/pending/`) contains the staged installer.

## Troubleshooting

If activities fail to load in the installed app, see
[Installed App: "Failed to load activities"](../troubleshooting/common-issues.md#installed-app-failed-to-load-activities).

[🇷🇺 Русский](building-installer.ru.md)
