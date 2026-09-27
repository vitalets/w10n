/**
 * Configures JavaScript and TypeScript linting with the repository's Git ignores.
 */
import js from '@eslint/js';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

export default defineConfig(
  includeIgnoreFile(
    [
      fileURLToPath(new URL('.gitignore', import.meta.url)),
      fileURLToPath(new URL('example/.gitignore', import.meta.url)),
    ],
    { gitignoreResolution: true },
  ),
  {
    files: ['**/*.{js,mjs,ts}'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/google-analytics/index.ts', 'example/src/w10n/google-analytics/index.ts'],
    rules: {
      // EventArguments uses {} to check whether event parameters are optional.
      '@typescript-eslint/no-empty-object-type': ['error', { allowObjectTypes: 'always' }],
    },
  },
);
