# RPAForge Studio

Electron + React desktop application for RPAForge.

## Development

### Prerequisites

- Node.js 20+ (20, 22)
- npm 9+
- Python 3.10+ (for Python bridge)

### Installation

```bash
# Install dependencies (with optional native bindings)
npm ci --include=optional

# Run in development mode
npm run dev

# Run Electron in development
npm run electron:dev
```

### Troubleshooting

If you get `Cannot find native binding` error:
1. Delete `node_modules` and `package-lock.json`
2. Run: `npm ci --include=optional`
3. On Windows: Ensure you have Python 3.10+ and Visual Studio Build Tools installed

## Build

```bash
# Build for production
npm run electron:build
```

## Architecture

```
src/
├── App.tsx              # Main application component
├── main.tsx             # React entry point
├── components/
│   ├── Common/          # Shared components (Layout, etc.)
│   ├── Designer/        # Process designer components
│   ├── Debugger/        # Debugger components
│   └── Recorder/        # Recorder components (future)
├── stores/              # Zustand state stores
├── hooks/               # Custom React hooks
└── utils/               # Utility functions

electron/
├── main.ts              # Electron main process
├── preload.ts           # Preload script for IPC
└── python-bridge.ts     # Python subprocess bridge
```

## IPC Communication

The UI communicates with the Python engine via IPC:

```typescript
// In renderer
const result = await window.rpaforge.engine.run({ process: '...' });

// Debugger
await window.rpaforge.debugger.stepOver();
const vars = await window.rpaforge.debugger.getVariables();
```
