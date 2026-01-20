# Translation Workflow

This document explains how to maintain proper internationalization (i18n) in the BIM application and how to use the automated translation checking tools.

## 🌍 Overview

The BIM application supports multiple languages (currently English and French) through a comprehensive i18n system. To maintain code quality and ensure all text is properly translated, we use automated checks that run on every Pull Request.

## 🚫 What Happens When Translations Are Missing

If you submit a PR with untranslated text, the **Translation Check** workflow will:

1. **Fail the PR** - preventing merge until translations are added
2. **Comment on your PR** - explaining what needs to be fixed
3. **Provide specific guidance** - showing exactly which translation keys are missing

## ✅ How to Write Properly Translated Code

### ❌ Don't Do This (Hardcoded Text)

```svelte
<h1>Welcome to BIM</h1>
<p>This is a Bitcoin wallet app</p>
<button>Click here to continue</button>
```

### ✅ Do This Instead (Translated Text)

```svelte
<h1>{$t('welcome.title')}</h1>
<p>{$t('welcome.description')}</p>
<button>{$t('welcome.continue_button')}</button>
```

## 🔧 Adding New Translations

### 1. Add Translation Keys to English Locale

```json
// src/lib/i18n/locales/en/common.json
{
  "welcome": {
    "title": "Welcome to BIM",
    "description": "This is a Bitcoin wallet app",
    "continue_button": "Click here to continue"
  }
}
```

### 2. Add Translation Keys to French Locale

```json
// src/lib/i18n/locales/fr/common.json
{
  "welcome": {
    "title": "Bienvenue sur BIM",
    "description": "Ceci est une application de portefeuille Bitcoin",
    "continue_button": "Cliquez ici pour continuer"
  }
}
```

### 3. Use the Translation Key in Your Code

```svelte
<script>
  import { t } from 'svelte-i18n';
</script>

<h1>{$t('welcome.title')}</h1>
```

## 🧪 Testing Translations Locally

### Run Translation Check

```bash
npm run check:translations
```

This will:

- Scan all source files for hardcoded text
- Check if all `$t()` calls have corresponding translation keys
- Verify all locales have complete coverage
- Show detailed results with file locations and line numbers

### Expected Output

```console
✅ All translations are properly configured!
```

If there are issues, you'll see:

```console
❌ Found X missing translation keys:
❌   - welcome.title
❌   - welcome.description
```

## 📁 Translation File Structure

### Locale Directory Structure

```console
src/lib/i18n/locales/
├── en/                    # English translations
│   ├── common.json       # Common UI elements
│   ├── dashboard.json    # Dashboard-specific text
│   ├── pay.json         # Payment flow text
│   └── receive.json     # Receive flow text
└── fr/                    # French translations
    ├── common.json       # Common UI elements
    ├── dashboard.json    # Dashboard-specific text
    ├── pay.json         # Payment flow text
    └── receive.json     # Receive flow text
```

### Translation Key Naming Convention

- Use **snake_case** for consistency
- Group related keys with dots: `dashboard.welcome.title`
- Use descriptive names: `auth.login.button` not `auth.btn`

### Example Translation Structure

```json
{
  "dashboard": {
    "welcome": {
      "title": "Welcome",
      "subtitle": "Welcome to your dashboard"
    },
    "actions": {
      "receive": "Receive",
      "send": "Send"
    }
  }
}
```

## 🚀 GitHub Workflow

### Automatic Checks

Every PR automatically runs the translation check workflow that:

1. **Scans changed files** for hardcoded text
2. **Validates translation keys** exist in all locale files
3. **Ensures complete coverage** across all supported languages
4. **Fails the PR** if translations are missing

### Workflow Triggers

- **Pull Requests** to `main` and `develop` branches
- **File changes** in `src/**/*.svelte`, `src/**/*.ts`, `src/**/*.js`
- **Translation file changes** in `src/lib/i18n/**/*.json`

## 🐛 Common Issues and Solutions

### Issue: "Found X missing translation keys"

**Solution**: Add the missing keys to all locale files (en/common.json, fr/common.json, etc.)

### Issue: "Potential hardcoded text found"

**Solution**: Replace hardcoded strings with `$t('translation.key')` calls

### Issue: "Locale 'fr' is missing X translation keys"

**Solution**: Ensure French translations exist for all keys used in the code

### Issue: Translation not showing up

**Solution**:

1. Check the translation key exists in locale files
2. Verify the key path is correct (e.g., `dashboard.welcome.title`)
3. Ensure i18n is properly initialized

## 📋 Best Practices

### 1. Always Use Translation Keys

- Never hardcode user-facing text
- Use descriptive key names
- Group related keys logically

### 2. Keep Translations Organized

- Use consistent file structure
- Group related translations together
- Maintain alphabetical order within sections

### 3. Test Both Languages

- Verify English translations work
- Verify French translations work
- Check for missing keys in both locales

### 4. Use Meaningful Key Names

```json
// Good
"dashboard.welcome.greeting": "Hello"

// Bad
"dash.w.g": "Hello"
```

## 🔍 Debugging Translation Issues

### Check Translation Key Existence

```bash
# Search for a specific key in locale files
grep -r "welcome.title" src/lib/i18n/locales/
```

### Verify Key Path

```json
// Make sure the path matches exactly
{
  "dashboard": {
    "welcome": {
      "title": "Welcome"  // This creates key: dashboard.welcome.title
    }
  }
}
```

### Check Console for Errors

Look for i18n-related errors in the browser console:

```console
[i18n] Translation key 'welcome.title' not found
```

## 📚 Additional Resources

- **Svelte-i18n Documentation**: <https://github.com/kaisermann/svelte-i18n>
- **Translation Best Practices**: <https://www.i18next.com/overview/best-practices>
- **Locale File Examples**: See existing files in `src/lib/i18n/locales/`

## 🆘 Getting Help

If you encounter translation issues:

1. **Run the local check**: `npm run check:translations`
2. **Check the workflow logs** in your PR
3. **Review existing translations** for examples
4. **Ask in PR comments** for guidance

Remember: **All user-facing text must be translated!** This ensures a consistent, professional experience for users in all supported languages.
