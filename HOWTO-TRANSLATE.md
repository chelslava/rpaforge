# How to Add a New Language to RPAForge

This guide explains how to add a new language (e.g., French, Portuguese, Japanese) to RPAForge Studio. No deep coding knowledge required - just basic JSON editing.

---

## Prerequisites

- Node.js and pnpm installed
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

## Step 4: Update Language List in Settings

### Edit `SettingsDialog.tsx`

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

## Step 5: Test Your Translation

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

---

## Step 6: Submit Your Translation

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

## Example: Adding Polish (pl)

1. Create folder: `packages/studio/public/locales/pl/`
2. Copy files: `cp packages/studio/public/locales/en/*.json packages/studio/public/locales/pl/`
3. Translate `common.json` - find and replace English text with Polish
4. Update `SettingsDialog.tsx` language options
5. Update `i18n/config.ts` and `i18n/types.ts`
6. Test and submit PR

---

**Thank you for contributing translations to RPAForge! 🌍✨**
