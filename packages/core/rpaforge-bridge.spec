# PyInstaller build spec for the RPAForge engine bridge.
#
# Produces a self-contained `bridge/` folder (onedir) whose `rpaforge-bridge`
# executable starts the JSON-RPC server (`rpaforge.bridge.__main__`). The Studio
# Electron app bundles this folder via electron-builder `extraResources` and
# spawns the executable in production instead of `python -m rpaforge.bridge.server`,
# so end users do not need Python or the rpaforge packages installed.
#
# Build (from packages/studio): `pnpm build:bridge`
# or directly:
#   pyinstaller packages/core/rpaforge-bridge.spec \
#     --distpath packages/studio/resources --noconfirm --clean

import os

from PyInstaller.utils.hooks import collect_all, collect_submodules

# SPECPATH is injected by PyInstaller and points at this spec's directory
# (packages/core). The bridge entry point lives under src/.
entry = os.path.join(SPECPATH, "src", "rpaforge", "bridge", "__main__.py")

# RPA libraries are imported dynamically via importlib at runtime
# (see rpaforge/bridge/handlers/shared.py: LIBRARY_MAPPINGS), so PyInstaller's
# static analysis cannot discover them. Collect every submodule explicitly.
# Submodules whose optional dependencies are absent in the build environment are
# simply skipped here, and the corresponding activities degrade gracefully at
# runtime (the bridge logs a warning and continues).
hidden_imports = collect_submodules("rpaforge") + collect_submodules("rpaforge_libraries")
datas = []
binaries = []

# Playwright (WebUI library) ships a Node driver as package data and native
# binaries that PyInstaller's module analysis does not pick up on its own;
# collect_all grabs its submodules, data, and binaries. The browser binaries
# themselves are NOT bundled here — they are shipped separately via the Electron
# `extraResources` config and located at runtime through PLAYWRIGHT_BROWSERS_PATH.
# Wrapped in try/except so the engine still builds in environments without the
# optional `web` extra installed (WebUI then degrades gracefully at runtime).
try:
    pw_datas, pw_binaries, pw_hidden = collect_all("playwright")
    datas += pw_datas
    binaries += pw_binaries
    hidden_imports += pw_hidden
except Exception as exc:  # noqa: BLE001 - optional dependency, never fatal
    print(f"[rpaforge-bridge.spec] Skipping playwright collection: {exc}")

analysis = Analysis(
    [entry],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(analysis.pure)

# console=True keeps real stdin/stdout handles for the JSON-RPC pipe transport.
# Electron spawns the process with `windowsHide: true`, so no console window is
# shown to the user on Windows.
exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="rpaforge-bridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# COLLECT name == "bridge" so the onedir output folder is `<distpath>/bridge`,
# which electron-builder copies to `resources/bridge` in the packaged app.
collect = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="bridge",
)
