# RPAForge Studio

Electron + React desktop application for RPAForge.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run Electron in development
npm run electron:dev
```

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
