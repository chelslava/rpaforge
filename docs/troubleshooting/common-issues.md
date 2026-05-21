# Troubleshooting Guide

Common issues and solutions for RPAForge.

## Installation Issues

### Python Dependencies Fail to Install

**Symptom**: `pip install` fails with dependency errors.

**Solution**:
```bash
# Update pip first
pip install --upgrade pip

# Install with all dependencies
pip install rpaforge-core rpaforge-libraries[all]

# Or use uv for faster installation
uv pip install rpaforge-core rpaforge-libraries[all]
```

### cryptography Module Not Found

**Symptom**: `ModuleNotFoundError: No module named 'cryptography'`

**Solution**:
```bash
pip install cryptography
```

### pywinauto Import Errors on Windows

**Symptom**: Desktop automation fails to initialize.

**Solution**:
```bash
# Install Visual Studio Build Tools if missing
# Download from: https://visualstudio.microsoft.com/downloads/

# Then install pywinauto
pip install pywinauto
```

## Runtime Issues

### Studio Won't Start

**Symptom**: Electron app fails to launch.

**Solutions**:
1. Check Node.js version (requires 20+):
   ```bash
   node --version
   ```

2. Rebuild native modules:
   ```bash
   cd packages/studio
   rm -rf node_modules package-lock.json
   pnpm install
   ```

3. Check for port conflicts:
   ```bash
   lsof -i :9222  # Default debug port
   ```

### Process Execution Timeout

**Symptom**: Activities timeout even when they should complete.

**Solutions**:
1. Increase timeout in activity settings
2. Check system resource availability
3. Verify subprocess pool size:
   ```python
   from rpaforge.core.subprocess_executor import get_pool_stats
   print(get_pool_stats())
   ```

### Credential Vault Locked

**Symptom**: `ValueError: Vault is locked` when accessing credentials.

**Solutions**:
1. Use context manager for proper cleanup:
   ```python
   with Credentials() as cred:
       cred.store_credential("key", "user", "pass")
   ```

2. Manually unlock if needed:
   ```python
   cred = Credentials()
   # Vault auto-unlocks on first access
   ```

## Automation Issues

### DesktopUI: Element Not Found

**Symptom**: `ElementNotFoundError` when targeting UI elements.

**Solutions**:
1. Use Selector Spy to verify selector:
   - Press `Ctrl+Shift+S` to open Selector Spy
   - Hover over element to see its properties

2. Try different search strategies:
   - Use `title` instead of `class_name`
   - Add `timeout` parameter

3. Increase wait time:
   ```python
   ui.wait_for_element("selector", timeout="10s")
   ```

### Database: SQL Connection Failed

**Symptom**: Cannot connect to database.

**Solutions**:
1. Verify connection string format:
   ```python
   # SQLite
   db.connect(":memory:")  # In-memory
   db.connect("path/to/db.sqlite")  # File
   
   # PostgreSQL
   db.connect("postgresql://user:pass@host:5432/dbname")
   ```

2. Check database server is running
3. Verify firewall rules for remote connections

### WebUI: Browser Doesn't Launch

**Symptom**: Playwright browser fails to start.

**Solutions**:
1. Install browser binaries:
   ```bash
   playwright install chromium
   ```

2. Check for missing system dependencies (Linux):
   ```bash
   sudo apt-get install libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1
   ```

## Performance Issues

### Slow Process Execution

**Symptom**: Automation runs slower than expected.

**Solutions**:
1. Reduce subprocess pool overhead:
   ```python
   executor = SubprocessExecutor(max_workers=2)
   ```

2. Use parallel execution for independent tasks:
   ```python
   # Use Parallel block for concurrent activities
   ```

3. Disable debugging for production:
   - Disable breakpoint checks
   - Reduce log verbosity

### High Memory Usage

**Symptom**: RPAForge consumes too much RAM.

**Solutions**:
1. Limit subprocess pool:
   ```python
   env["RPAFORGE_MAX_WORKERS_LIMIT"] = "4"
   ```

2. Close resources properly:
   ```python
   with Credentials() as cred:
       # Use credentials
   # Auto-cleanup on exit
   ```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RPAFORGE_MAX_WORKERS_LIMIT` | `cpu_count * 4` | Max subprocess pool size |
| `RPAFORGE_LOG_LEVEL` | `INFO` | Logging level |
| `RPAFORGE_LOG_DIR` | `~/.rpaforge/logs` | Log file directory |

### Custom Library Path

**Symptom**: Custom RPA libraries not found.

**Solution**:
```bash
export PYTHONPATH="/path/to/custom/libraries:$PYTHONPATH"
```

## Getting Help

If issues persist:

1. Check [GitHub Issues](https://github.com/chelslava/rpaforge/issues)
2. Run with debug logging:
   ```bash
   export RPAFORGE_LOG_LEVEL=DEBUG
   rpaforge ...
   ```
3. Collect logs from `~/.rpaforge/logs/`
