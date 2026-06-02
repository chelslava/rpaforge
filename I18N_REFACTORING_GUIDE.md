# i18n Refactoring Guide

## Overview

This guide describes how to add internationalization (i18n) support to Python library strings using the two refactoring scripts.

## Current Status

✅ **UI Localization**: 100% complete
- Chinese (中文), Russian, German, Spanish fully supported
- All activity descriptions translated
- 230+ activities across 18 files

✅ **Python i18n Preparation**: 90% complete
- 128 strings already using `_()` function
- shared.json translations ready for Python libraries
- Only 15 additional strings need wrapping

❌ **Remaining Work**: 2% of all messages
- 7 additional strings in 3 files need `_()` wrapping
- Quick automation available

## Scripts

### 1. Analyze i18n Opportunities

**File**: `add_i18n_to_strings.py`

**Purpose**: Identify all hardcoded strings that should be wrapped with i18n

**Usage**:
```bash
python -Xutf8 add_i18n_to_strings.py [root_dir]
```

**Output**: 
- Lists all candidate strings by file and line number
- Shows context (logger.warning, raise Exception, etc.)
- Provides summary statistics

**Example Output**:
```
📄 packages\libraries\src\rpaforge_libraries\Credentials\library.py
   Found 4 candidate(s) for i18n wrapping:
   • Line 52 [logger.warning]: "cryptography library not installed..."
   • Line 177 [logger.warning]: "Vault data is not encrypted..."
   ...
```

### 2. Apply i18n Wrapping

**File**: `apply_i18n_wrapping.py`

**Purpose**: Automatically wrap identified strings with `_()` function

**Usage** (Dry-run):
```bash
python -Xutf8 apply_i18n_wrapping.py [root_dir]
```

**Usage** (Apply changes):
```bash
python -Xutf8 apply_i18n_wrapping.py [root_dir] --apply
```

**Features**:
- Uses AST rewriting to preserve code structure
- Automatically adds `from rpaforge_libraries.i18n import _` import
- Skips already-wrapped strings
- Filters out short strings and variable names

**Example**:
```python
# Before
raise ValueError("Confidence must be between 0.0 and 1.0")

# After
raise ValueError(_("Confidence must be between 0.0 and 1.0"))
```

## How i18n Works in Python Libraries

The `rpaforge_libraries.i18n` module loads translations from JSON files:

```python
from rpaforge_libraries.i18n import _

# Usage in code:
logger.warning(_("Some message to be translated"))
raise ValueError(_("Error message that can be localized"))
```

**Translation Sources**: 
- Loads from `packages/studio/public/locales/[lang]/shared.json`
- Supports: 中文, Русский, Deutsch, Español

## Step-by-Step Workflow

### 1. Analyze current state
```bash
python -Xutf8 add_i18n_to_strings.py .
```

### 2. Review candidates
Check the output and verify which strings should be translated.

### 3. Apply changes (dry-run first!)
```bash
python -Xutf8 apply_i18n_wrapping.py . --apply
```

### 4. Test changes
```bash
cd packages/core
python -m pytest tests/ -v
```

### 5. Commit changes
```bash
git add packages/libraries/src/rpaforge_libraries/
git commit -m "i18n: wrap hardcoded strings with _()"
```

### 6. Verify translations
All wrapped strings are automatically translated through:
- `shared.json` files (already translated)
- i18n loader in Python

## Current Results

### Analysis:
- **Total candidates found**: 15
- **Files to modify**: 3
- **Effort**: < 5 minutes

### Files affected:
1. `Credentials/library.py` - 4 strings
2. `DesktopUI/library.py` - 1 string  
3. `OCR/library.py` - 2 strings

## Expected Impact

After applying changes:
- ✅ All error messages can be localized
- ✅ All logging messages can be localized
- ✅ Automatic fallback to English if translation missing
- ✅ Zero breaking changes to API

## Limitations

The scripts have these limitations:
- f-strings are not wrapped (require manual handling)
- Complex string concatenation not handled
- Comments not analyzed

These would require additional manual work but are rare in the codebase.

## Future Improvements

1. **Auto-generate translations**: Create .po files from wrapped strings
2. **CI validation**: Add check to prevent unwrapped user-facing strings
3. **Coverage metrics**: Track i18n coverage by library
4. **Automated testing**: Test all language variants

## Related Documentation

- [[adding-a-new-language-to-rpaforge-i18n-system]] - How to add new languages
- [[i18n-application-analysis-updated-status]] - Current i18n analysis
- [rpaforge_libraries/i18n.py](packages/libraries/src/rpaforge_libraries/i18n.py) - Implementation

## Contact

For questions about i18n refactoring, see the main documentation or ask in development discussions.
