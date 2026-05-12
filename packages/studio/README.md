# RPAForge Studio

RPAForge Studio is the Electron and React desktop application for building, running, debugging, and recording RPA processes on top of the RPAForge Python engine.

## Quick Start

### Prerequisites

- Node.js 20 or 22
- npm 9+
- Python 3.10+
- RPAForge core and library packages installed from the repository root

```bash
# From the repository root
uv pip install -e packages/core
uv pip install -e packages/libraries

# From this package
cd packages/studio
npm ci --include=optional
npm run dev
```

For the packaged desktop shell, run:

```bash
npm run electron:dev
```

## Architecture Overview

Studio is split into three main layers:

- Renderer UI: React, Vite, React Flow, Zustand, and TailwindCSS render the visual process designer, debugger, recorder, and shared application shell.
- Electron shell: `electron/main.ts` owns the desktop process, window lifecycle, Content Security Policy, and validated IPC handlers.
- Python bridge: `electron/python-bridge.ts` connects the desktop shell to the RPAForge Python engine and subprocess execution flow.

The renderer never calls Python directly. It sends validated IPC requests through the preload bridge, and the Electron main process forwards supported operations to the Python bridge.

## Component Structure

```text
src/
  App.tsx                  # Top-level React application
  main.tsx                 # Renderer entry point
  bridge/                  # Typed bridge helpers for Electron IPC
  components/              # UI components grouped by feature
  config/                  # Frontend configuration
  domain/                  # Studio domain objects and utilities
  hooks/                   # Custom React hooks
  integration/             # Integration-layer helpers
  stores/                  # Zustand stores
  templates/               # Process and UI templates
  test/                    # Shared test setup
  types/                   # Renderer TypeScript types
  utils/                   # Shared renderer utilities

electron/
  main.ts                  # Electron main process
  preload.ts               # Safe renderer preload bridge
  ipc-validator.ts         # IPC payload validation
  python-bridge.ts         # Python subprocess bridge
```

## Testing

Run focused checks from `packages/studio`:

```bash
npm run lint
npm run test
```

Build the renderer and Electron bundle with:

```bash
npm run build
```

For changes that affect the Python bridge or engine integration, also run the Python test suites from the repository root:

```bash
pytest packages/core/tests -v
```

## Troubleshooting

If optional native bindings fail to load:

1. Delete `node_modules`.
2. Reinstall with `npm ci --include=optional`.
3. On Windows, verify Python 3.10+ and Visual Studio Build Tools are available.

If the desktop shell cannot reach the Python engine, confirm the editable Python packages were installed from the repository root and that the active Python environment is the same one used by Studio.

## Contributing

- Keep renderer code type-safe and avoid unused exports.
- Keep IPC payloads validated in `electron/ipc-validator.ts`.
- Add focused tests for new UI behavior, stores, or bridge logic.
- Run lint and relevant tests before opening a pull request.
- Keep documentation changes in sync with package scripts and folder names.
