# Scripting Library

## Overview

Scripting executes arbitrary Python in an **isolated child interpreter** (`sys.executable -c <bootstrap>`) with a hard wall-clock timeout (issue #859). Use it for glue logic that does not fit the expression evaluator: date math, string munging, JSON reshaping, one-off API calls.

**Result protocol:** the script runs in a fresh module namespace; `arguments` arrive as the module-level `__rpaforge_args__` dict; the variable named `result` (configurable via `result_variable`) set by the script is JSON-serialised (non-JSONable values fall back to `str()`) and returned in the activity result. Non-zero exit or an uncaught exception yields `status='error'` with the traceback in `stderr`; exceeding the timeout kills the child and yields `status='timeout'`.

## Installation

No additional dependencies required.

## Security

- The child interpreter inherits the OS rights of the running worker. Robot sandbox policies apply at the activity boundary in the executor; the child itself is an ordinary Python process, so **prefer least-privilege policies and network-restricted environments when executing untrusted diagrams**.
- User code travels base64-encoded inside the bootstrap command, so quotes/newlines/control characters in the script cannot break the wrapping process invocation.
- `stdout`/`stderr` echoed in the result are capped at 10 000 characters to keep results JSON-safe.

## Keywords

### invoke_python_script
**Description:** Execute arbitrary Python in an isolated child interpreter.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| script | str (code) | No* | Inline Python source |
| script_path | str | No* | Path to a `.py` file, used when `script` is empty |
| arguments | dict | No | JSON-safe values exposed as `__rpaforge_args__` |
| timeout_seconds | float | No | Wall-clock limit; child killed on expiry (default: 60.0) |
| result_variable | str | No | Script variable returned as `result` (default: `'result'`) |

\* at least one of `script` / `script_path` is required.

**Returns:** dict - `status` (ok/error/timeout), `exit_code`, `result`, `stdout`, `stderr`, `duration_ms`

**Raises:** `ValueError` when neither source is provided; `ScriptExecutionError` when the interpreter cannot be spawned.

## Example

```python
from rpaforge_libraries.Scripting import Scripting

scripting = Scripting()
outcome = scripting.invoke_python_script(
    script="""
import re
rows = __rpaforge_args__["rows"]
result = [r for r in rows if re.match(r"^INV-", r.get("code", ""))]
""",
    arguments={"rows": [{"code": "INV-1"}, {"code": "ORD-2"}]},
)
assert outcome["status"] == "ok"
print(outcome["result"])  # [{'code': 'INV-1'}]
```
