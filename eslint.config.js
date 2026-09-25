import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

// Fokus auf Fehlerquellen (ungenutzte Variablen, fehlende awaits in Schleifen, Vue-Fallen),
// nicht auf Formatierung – die bleibt wie sie ist.
export default tseslint.config(
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', '.roundtrip/**', 'src/core/lvgl/mdiAll.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, defineBackground: 'readonly', defineContentScript: 'readonly', browser: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'vue/multi-word-component-names': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
