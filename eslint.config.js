import config from '@notch/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

const READS_THE_CLOCK = 'Pass `now` in instead of reading the clock, so the logic stays testable.';

export default [
  ...config,
  {
    // Plan 9.4: domain logic never reads the clock.
    files: ['packages/shared/src/{progress,progression,schedule,stats}/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: READS_THE_CLOCK,
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: READS_THE_CLOCK,
        },
      ],
    },
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
    rules: { 'no-var': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/src/**/*.tsx'],
    ...reactRefresh.configs.vite,
  },
  {
    // shadcn/ui components export their variants next to the component.
    files: ['apps/web/src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
];
