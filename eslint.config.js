/**
 * Configures JavaScript and TypeScript linting with the repository's Git ignores.
 */
import js from '@eslint/js';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import visualComplexity from 'eslint-plugin-visual-complexity';
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
    plugins: {
      visual: visualComplexity,
    },
    rules: {
      complexity: 0,
      'visual/complexity': ['error', { max: 5 }],
      'max-depth': ['error', { max: 2 }],
      'max-nested-callbacks': ['error', { max: 2 }],
      'max-params': ['error', { max: 3 }],
      'max-statements': ['error', { max: 12 }, { ignoreTopLevelFunctions: false }],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
      'max-len': ['error', { code: 120, ignoreUrls: true }],
      'max-lines': ['error', { max: 200, skipComments: true, skipBlankLines: true }],
    },
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
