# Testing Guide / Руководство по тестированию

## Prerequisites / Предварительные требования

1. Python 3.10+ with pip (Python 3.14 has asyncio issues on Windows)
2. Node.js 18+ with npm
3. Virtual environment (recommended)

## Setup / Настройка

### 1. Python Environment

```bash
# Create virtual environment
python3 -m venv .venv

# Activate (Linux/Mac)
source .venv/bin/activate

# Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Activate (Windows CMD)
.venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements-dev.txt
pip install -e packages/core
pip install -e packages/libraries
```

**Note for Windows Users:**
- Python 3.14 has known issues with asyncio on Windows. Use Python 3.10-3.13 if you encounter errors.
- Run PowerShell as Administrator if you get permission errors during npm install

### 2. Node.js Environment

```bash
# Install dependencies
cd packages/studio
npm install

# Fix vulnerabilities (optional)
npm audit fix
```

## Testing Python Bridge

### Test Bridge Server Directly

```bash
# Using Python module
python -m rpaforge.bridge.server

# Or from packages/core
cd packages/core
python -m rpaforge.bridge.server
```

Send JSON-RPC messages via stdin:
```json
{"jsonrpc":"2.0","method":"ping","id":1}
{"jsonrpc":"2.0","method":"getCapabilities","id":2}
{"jsonrpc":"2.0","method":"getActivities","id":3}
```

### Test SDK

```python
from rpaforge.sdk import activity, ActivityType, Port, Param, ParamType, list_activities

# List registered activities
activities = list_activities()
for a in activities:
    print(f"{a.name} ({a.type.value})")
```

## Testing Electron App

### Development Mode (Recommended)

**Option 1: Two terminals**

```bash
# Terminal 1: Start Vite dev server
cd packages/studio
npm run dev

# Terminal 2: Start Electron (in new terminal)
cd packages/studio
npm run electron:dev
```

**Option 2: Single command**

```bash
cd packages/studio
npm run electron:dev
```

### Production Build

**Note:** Building production requires Administrator privileges on Windows.

```bash
cd packages/studio

# Build without packaging (faster)
npm run build

# Build with packaging (requires Admin on Windows)
# Run PowerShell as Administrator first!
npm run electron:build
```

**Windows Build Issues:**

If you get symbolic link errors:
1. Run PowerShell as Administrator
2. Or enable Developer Mode in Windows Settings
3. Or skip packaging and use development mode

## Testing Integration

### 1. Open RPAForge Studio
```bash
cd packages/studio
npm run electron:dev
```

### 2. Check Console
- DevTools should show: `[PythonBridge] Connected to Python engine`
- No errors in console
- If you see "Python engine failed to start", check:
  - Python is in PATH
  - Virtual environment is activated
  - rpaforge package is installed: `pip show rpaforge-core`

### 3. Test Process Execution
1. Create a new process
2. Add Start block
3. Add Log block with message "Hello from RPAForge!"
4. Add End block
5. Connect blocks
6. Click Play button
7. Check Console Output panel for logs

### 4. Test Variables
1. Add Assign block: `${var} = 42`
2. Add Log block: `${var}`
3. Run process
4. Check Variable Panel shows `var = 42`

### 5. Test Debugger
1. Click on block to set breakpoint (red dot should appear)
2. Run process
3. Process should pause at breakpoint
4. Step controls (F5, F6, F7) should work
5. Variable panel should update

## Troubleshooting

### Python Bridge Not Starting

1. Check Python path in `packages/studio/electron/python-bridge.ts`:
   ```typescript
   private getPythonPath(): string {
     // For Windows, adjust path:
     if (process.platform === 'win32') {
       return 'python';  // or full path to .venv\Scripts\python.exe
     }
     // ...
   }
   ```

2. Verify virtual environment is activated:
   ```bash
   # Check
   which python  # Linux/Mac
   where python  # Windows
   
   # Should point to .venv
   ```

3. Check `rpaforge` package is installed:
   ```bash
   pip show rpaforge-core
   pip show rpaforge-libraries
   ```

4. Test bridge manually:
   ```bash
   python -m rpaforge.bridge.server
   # Then type: {"jsonrpc":"2.0","method":"ping","id":1}
   # Should see: {"jsonrpc":"2.0","result":{"pong":true,...},"id":1}
   ```

### No Activities in Palette

1. Check SDK registry:
   ```bash
   python -c "from rpaforge.sdk import list_activities; print(list_activities())"
   ```
   
2. Verify bridge is running: Check DevTools console

3. Check `getActivities` response in Network tab (DevTools)

### Process Not Running

1. Check bridge connection:
   ```javascript
   // In DevTools Console:
   window.rpaforge.bridge.isReady()
   // Should return: true
   ```

2. Check Robot Framework is installed:
   ```bash
   pip show robotframework
   ```

3. Check process code in Console (debug mode)

### Windows AsyncIO Errors

If you see `OSError: [WinError 6]` or `AttributeError: '_ProactorReadPipeTransport' object has no attribute '_empty_waiter'`:

1. Use Python 3.10-3.13 instead of 3.14
2. Or wait for Python 3.14.1+ which may fix this
3. The bridge server has fallback sync mode for Windows

### Electron Build Errors

If you get "Cannot create symbolic link" errors:

**Option 1: Run as Administrator**
```powershell
# Right-click PowerShell -> Run as Administrator
cd packages\studio
npm run electron:build
```

**Option 2: Enable Developer Mode**
1. Settings -> Update & Security -> For developers
2. Enable "Developer mode"
3. Restart computer
4. Try build again

**Option 3: Skip packaging**
```bash
# Just build without packaging
npm run build
# Then run from dist
npx electron .
```

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Electron Main Process            │
│  ┌─────────────────────────────────────┐│
│  │   python-bridge.ts                  ││
│  │   - Spawns Python process           ││
│  │   - Manages JSON-RPC communication  ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
                    │ stdin/stdout JSON-RPC
                    ▼
┌─────────────────────────────────────────┐
│         Python Process                   │
│  ┌─────────────────────────────────────┐│
│  │   bridge/server.py                  ││
│  │   - JSON-RPC server                 ││
│  │   - Handles requests                ││
│  │   - Emits events                    ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │   engine/executor.py                ││
│  │   - Robot Framework wrapper         ││
│  │   - Process execution               ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │   sdk/__init__.py                   ││
│  │   - Activity registry               ││
│  │   - Type definitions                ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

## Next Steps

After successful testing:
1. Implement Code Generator (#27)
2. Implement Variables UI (#28)
3. Implement Debugger UI (#29)
4. Implement File Operations (#30)
5. Implement Activity Registry Auto-Discovery (#31)
