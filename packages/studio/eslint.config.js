import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-electron/**', 'release/**', '**/*.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: true,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'warn',
      // Recovery paths may report through warn/error; debug output must use the logger.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // i18n guard: user-facing strings must be routed through t() (issue #826).
      // Multi-word JSX text nodes and literal title/placeholder/aria-label
      // attributes are the patterns every confirmed leak shared.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXText[value=/^\\s*[A-Z][a-z]+ [a-zA-Z]/]",
          message: 'Hardcoded UI text — route through i18n t() (issue #826).',
        },
        {
          selector:
            "JSXAttribute[name.name=/^(title|placeholder|aria-label)$/][value.type='Literal'][value.value=/^[A-Z][a-z]+/]",
          message:
            'Hardcoded attribute text — route through i18n t() (issue #826).',
        },
      ],
    },
  },
  {
    // Tests legitimately assert on raw English strings and fixture text.
    // Listed AFTER the main block so the override wins in flat-config order.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  }
);
