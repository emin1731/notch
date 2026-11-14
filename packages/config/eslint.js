import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/** Shared flat config. Apps and packages extend it from the root `eslint.config.js`. */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/src/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  prettier,
);
