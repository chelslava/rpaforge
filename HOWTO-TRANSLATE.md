# How to Add a New Language to RPAForge

This guide explains how to add a new language (e.g., French, Portuguese, Japanese) to RPAForge Studio and Python libraries. No deep coding knowledge required - just basic JSON editing.

Supports both:
- **Frontend (React UI)** — Visual designer, menus, dialogs
- **Backend (Python)** — Library logging, error messages, operation descriptions

---

## Prerequisites

- Node.js and pnpm installed (for frontend changes)
- Python 3.10+ (for backend changes)
- Git account (for contributing translations)

---

## Step 1: Create a New Translation Folder

**Location:** `packages/studio/public/locales/`

Create a new folder with your language's ISO 639-1 code:

| Language | Folder Name | Example |
|----------|-------------|---------|
| French | `fr` | `packages/studio/public/locales/fr/` |
| Portuguese | `pt` | `packages/studio/public/locales/pt/` |
| Japanese | `ja` | `packages/studio/public/locales/ja/` |

**Action:** Create the folder manually or via command:
```bash
mkdir packages/studio/public/locales/[language-code]
```

---

## Step 2: Copy English Locale Files

Copy all 17 JSON files from the English folder:

```bash
cp packages/studio/public/locales/en/*.json packages/studio/public/locales/[language-code]/
```

You should have these files:
- `blocks.json`, `builtin.json`, `common.json`, `credentials.json`, `database.json`, `dataframes.json`, `datetime.json`, `desktopui.json`, `errors.json`, `excel.json`, `file.json`, `flow.json`, `http.json`, `ocr.json`, `string.json`, `variables.json`, `webui.json`

---

## Step 3: Translate Each File

Open each file in a text editor and replace English values with your translation.

### What to Translate:

**For basic terms (common.json):**
```json
{
  "actions": {
    "save": "Save",           // → "Сохранить" (Russian) / "Speichern" (German) / "Guardar" (Spanish)
    "cancel": "Cancel",       // → "Отмена" / "Abbrechen" / "Cancelar"
    "ok": "OK"                // → "ОК" / "OK" / "Aceptar"
  }
}
```

**For activity names (library files):**
```json
{
  "activities": {
    "open_workbook": {
      "name": "Open Workbook",        // → "Открыть книгу" / "Arbeitsmappe öffnen" / "Abrir libro"
      "description": "Open an..."     // → "Открыть существующий..." / "Öffnen..." / "Abrir..."
    }
  }
}
```

**For parameter labels (activity params):**
```json
{
  "params": {
    "selector": {
      "label": "Selector",            // → "Селектор" / "Selektor" / "Selector"
      "description": "CSS or..."      // → "CSS или XPath..." / "CSS oder..." / "CSS o XPath"
    },
    "timeout": {
      "label": "Timeout"              // → "Таймаут" / "Zeitlimit" / "Tiempo límite"
    }
  }
}
```

### What NOT to Change:

❌ **Don't change:**
- JSON structure (curly braces, brackets, commas)
- Key names (`"actions"`, `"save"`, `"open_workbook"`, `"params"`)
- Property names (`"name"`, `"description"`, `"label"`, `"description"` inside params)
- Unicode control characters

✅ **Only change:**
- Values (the text after the colon)

---

## Step 3.5: Backend Localization (shared.json)

The Python RPA libraries (WebUI, DesktopUI, Database, Excel, etc.) use a centralized translation file for common operation messages.

### Edit `packages/studio/public/locales/[language-code]/shared.json`

This file contains 348+ translation keys used by Python backend libraries. It's organized by category:

```json
{
  "database": {
    "connected_to_database": "Connected to database: {database_name}",
    "query_returned_rows": "Query returned {row_count} rows",
    "transaction_started": "Transaction started"
  },
  "file": {
    "file_not_found": "File not found: {file_path}",
    "directory_created": "Directory created: {directory_path}"
  },
  "webui": {
    "page_loaded": "Page loaded: {page_title}",
    "navigated_to": "Navigated to: {url}"
  }
}
```

**Important:**
- Keep all placeholder variables like `{database_name}`, `{row_count}`, `{file_path}` exactly as they are
- These are used for string interpolation in Python code
- Translate only the text around the placeholders

### Example translation (Russian):

```json
{
  "database": {
    "connected_to_database": "Подключено к БД: {database_name}",
    "query_returned_rows": "Запрос вернул {row_count} строк"
  }
}
```

### Backend Language Detection

The Python backend automatically detects the language from the `LANG` environment variable:

```bash
# Linux/macOS
export LANG=fr_FR    # French
export LANG=de_DE    # German
export LANG=pt_BR    # Portuguese (Brazil)

# Windows PowerShell
$env:LANG = "fr_FR"
```

Supported languages in Python are defined in `packages/libraries/src/rpaforge_libraries/i18n.py`:

```python
# Line 61
if lang not in ("en", "ru", "de", "es"):  # Add your language code here
    lang = "en"
```

**If you add a new language**, you must update this line to include your language code:

```python
if lang not in ("en", "ru", "de", "es", "fr"):  # Added "fr" for French
    lang = "en"
```

---

## Step 5: Update Language Configuration

### 5.1 Backend Support - Update `i18n.py`

**File:** `packages/libraries/src/rpaforge_libraries/i18n.py`

Find line 61 and add your language code to the supported languages tuple:

```python
# BEFORE:
if lang not in ("en", "ru", "de", "es"):
    lang = "en"

# AFTER (example for French):
if lang not in ("en", "ru", "de", "es", "fr"):
    lang = "en"
```

### 5.2 Frontend UI - Update `SettingsDialog.tsx`

**File:** `packages/studio/src/components/Common/SettingsDialog.tsx`

Find this section (lines 17-32):

```typescript
const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((lang) => ({
  value: lang,
  label: lang === 'en'
    ? t('settings.languageEnglish', 'English')
    : lang === 'ru'
      ? t('settings.languageRussian', 'Русский')
      : lang === 'de'
        ? t('settings.languageGerman', 'Deutsch')
        : t('settings.languageSpanish', 'Español'),
}));
```

**Add your language:**
```typescript
const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((lang) => ({
  value: lang,
  label: lang === 'en'
    ? t('settings.languageEnglish', 'English')
    : lang === 'ru'
      ? t('settings.languageRussian', 'Русский')
      : lang === 'de'
        ? t('settings.languageGerman', 'Deutsch')
        : lang === 'es'
          ? t('settings.languageSpanish', 'Español')
          : lang === 'fr'
            ? t('settings.languageFrench', 'Français')  // ← ADD THIS
            : t('settings.languageEnglish', 'English'), // fallback
}));
```

### Edit `i18n/config.ts`

**File:** `packages/studio/src/i18n/config.ts`

Add your language code to SUPPORTED_LANGUAGES:

```typescript
export const SUPPORTED_LANGUAGES: Language[] = ['en', 'ru', 'de', 'es', 'fr'];  // ← ADD 'fr'
```

### Edit `i18n/types.ts`

**File:** `packages/studio/src/i18n/types.ts`

Update the Language type:

```typescript
export type Language = 'en' | 'ru' | 'de' | 'es' | 'fr';  // ← ADD 'fr'
```

### Edit `SettingsDialog.tsx` (type update)

Find the handleSetLanguage function:

```typescript
const handleSetLanguage = (lang: Language) => {  // Already uses Language type from config
  setLanguage(lang);
  void i18n.changeLanguage(lang);
};
```

No changes needed here - it automatically uses the Language type from config.ts.

---

## Step 6: Test Your Translation

### Frontend Testing (UI)

1. **Build the project:**
   ```bash
   cd packages/studio
   pnpm install
   pnpm build
   ```

2. **Run locally:**
   ```bash
   pnpm dev
   ```

3. **Test in UI:**
   - Open Settings (gear icon or Settings menu)
   - You should see your language in the dropdown
   - Select it and verify all text is translated

4. **Check for missing translations:**
   - If something shows in English, it means you missed a key
   - Use the key names to find and translate the missing phrases

### Backend Testing (Python Libraries)

1. **Test library translations:**
   ```bash
   # Set language environment variable
   export LANG=fr_FR  # Replace 'fr' with your language code
   
   # Run tests - should use your language
   cd packages/libraries
   python -m pytest tests/ -v
   ```

2. **Verify logs use correct language:**
   - Run a simple test and check output
   - Look for your translated strings in the logs
   - If you see English, check that you updated `i18n.py`

3. **Manual validation (optional):**
   ```python
   # Quick Python test
   import os
   os.environ["LANG"] = "fr_FR"
   
   from rpaforge_libraries.i18n import _
   print(_("database.connected_to_database", database_name="test"))
   # Should print French translation, not English
   ```

---

## Step 7: Submit Your Translation

### Option A: GitHub Pull Request (Recommended)

1. Fork the repository
2. Create a branch: `feat/translation-[language-code]`
3. Add your changes
4. Push and open a PR

### Option B: Submit JSON files

If you're not comfortable with Git, you can:
1. Compress your locale folder: `tar -czf [language-code].tar.gz packages/studio/public/locales/[language-code]/`
2. Upload to GitHub Gist or send to project maintainers

---

## Common Language Codes

| Language | Code | Flag |
|----------|------|------|
| Afrikaans | `af` | 🇿🇦 |
| Arabic | `ar` | 🇸🇦 |
| Bulgarian | `bg` | 🇧🇬 |
| Catalan | `ca` | 🇦🇩 |
| Chinese (Simplified) | `zh` | 🇨🇳 |
| Chinese (Traditional) | `zh-TW` | 🇹🇼 |
| Croatian | `hr` | 🇭🇷 |
| Czech | `cs` | 🇨🇿 |
| Danish | `da` | 🇩🇰 |
| Dutch | `nl` | 🇳🇱 |
| English | `en` | 🇬🇧 |
| Estonian | `et` | 🇪🇪 |
| Finnish | `fi` | 🇫🇮 |
| French | `fr` | 🇫🇷 |
| German | `de` | 🇩🇪 |
| Greek | `el` | 🇬🇷 |
| Hebrew | `he` | 🇮🇱 |
| Hindi | `hi` | 🇮🇳 |
| Hungarian | `hu` | 🇭🇺 |
| Icelandic | `is` | 🇮🇸 |
| Indonesian | `id` | 🇮🇩 |
| Italian | `it` | 🇮🇹 |
| Japanese | `ja` | 🇯🇵 |
| Korean | `ko` | 🇰🇷 |
| Latvian | `lv` | 🇱🇻 |
| Lithuanian | `lt` | 🇱🇹 |
| Malay | `ms` | 🇲🇾 |
| Norwegian | `no` | 🇳🇴 |
| Polish | `pl` | 🇵🇱 |
| Portuguese | `pt` | 🇵🇹 |
| Portuguese (Brazil) | `pt-BR` | 🇧🇷 |
| Romanian | `ro` | 🇷🇴 |
| Russian | `ru` | 🇷🇺 |
| Serbian | `sr` | 🇷🇸 |
| Slovak | `sk` | 🇸🇰 |
| Slovenian | `sl` | 🇸🇮 |
| Spanish | `es` | 🇪🇸 |
| Swedish | `sv` | 🇸🇪 |
| Thai | `th` | 🇹🇭 |
| Turkish | `tr` | 🇹🇷 |
| Ukrainian | `uk` | 🇺🇦 |
| Vietnamese | `vi` | 🇻🇳 |

---

## Troubleshooting

### "Cannot find module" error
- Ensure you created the folder in the correct location
- Check file names match exactly (lowercase, correct extension `.json`)

### "Translation missing" shown in UI
- You're using `t('key.name')` in code
- The key `key` must exist in your locale JSON
- Use English locale as reference for all available keys

### Build fails with TypeScript error
- Check that `SUPPORTED_LANGUAGES` array includes your code
- Check that `Language` type includes your code
- Run `pnpm install` to rebuild type definitions

---

## Need Help?

- 💬 Join our [Discord](https://discord.gg/rpaforge) for translation help
- 📝 Open an [issue](https://github.com/chelslava/rpaforge/issues) for bugs
- 🌐 Check [Crowdin](https://crowdin.com/project/rpaforge) if available

---

## Step 8: Translating Documentation (README and HOWTO-TRANSLATE)

If you want to go beyond UI translations, you can also translate the project documentation:

### Translating README

1. **Create a new README file:**
   ```bash
   cp README.md README.[language-code].md
   # Example: README.fr.md for French
   ```

2. **Translate all content:**
   - Translate section headers
   - Translate descriptions and explanations
   - Keep technical names and links intact
   - Translate command examples where applicable

3. **Add language links to README files:**
   - In `README.md` — add link to new README in header
   - In your new `README.[lang].md` — add links to other languages

   **Example for French (fr):**
   ```markdown
   [🇬🇧 English](README.md) · [🇷🇺 Русский](README.ru.md) · [🇩🇪 Deutsch](README.de.md) · [🇪🇸 Español](README.es.md) · [🇫🇷 Français](README.fr.md)
   ```

4. **Key sections to translate:**
   - Title and subtitle
   - Features table
   - Architecture description
   - Quick Start section
   - Libraries table
   - Development section
   - Roadmap
   - Documentation links
   - Contributing guidelines

### Translating HOWTO-TRANSLATE.md

This file is especially important for translators. Consider creating a translated version:

```bash
cp HOWTO-TRANSLATE.md HOWTO-TRANSLATE.[lang].md
# Example: HOWTO-TRANSLATE.ru.md for Russian
```

**Important notes:**
- Keep the step-by-step structure
- Translate all examples
- Keep command examples in English (code doesn't change)
- Keep file paths in English
- Translate descriptions and explanations

### Updating Main README with Links

Once you've created translated documentation, add them to the main README:

**In `README.md` Documentation section:**
```markdown
| [Translation Guide](HOWTO-TRANSLATE.md) | Add translations for new languages |
| [Translated Guides](#) | [HOWTO-TRANSLATE.ru.md](HOWTO-TRANSLATE.ru.md) · [HOWTO-TRANSLATE.de.md](HOWTO-TRANSLATE.de.md) |
```

### Files to Consider Translating

| Priority | File | Impact |
|----------|------|--------|
| **High** | `README.[lang].md` | Main entry point for users |
| **High** | `HOWTO-TRANSLATE.[lang].md` | Helps next translators |
| **Medium** | `docs/getting-started/quick-start.md` | Essential for onboarding |
| **Medium** | `CONTRIBUTING.md` | For contributors in your language |
| **Low** | `ROADMAP.md` | Strategic information |
| **Low** | `CHANGELOG.md` | Historical reference |

### Tips for Translating Documentation

1. **Consistency** — Use the same terminology throughout
2. **Clarity** — Translate for understanding, not word-for-word
3. **Keep Links** — Don't translate URLs or file paths
4. **Preserve Formatting** — Keep markdown structure intact
5. **Technical Terms** — Some terms may be better kept in English (JSON, API, etc.)
6. **Test** — Verify translated content reads naturally

---

## Example: Adding Polish (pl)

1. Create folder: `packages/studio/public/locales/pl/`
2. Copy files: `cp packages/studio/public/locales/en/*.json packages/studio/public/locales/pl/`
3. Translate all JSON files (`common.json`, `blocks.json`, `shared.json`, etc.)
4. Update `packages/libraries/src/rpaforge_libraries/i18n.py` line 61 to include `pl`
5. Update `SettingsDialog.tsx` language options
6. Update `i18n/config.ts` and `i18n/types.ts` to include `pl`
7. Test both UI (pnpm dev) and backend (pytest with LANG=pl_PL)
8. Submit PR

---

**Thank you for contributing translations to RPAForge! 🌍✨**
