import config from '@notch/config/eslint';

const READS_THE_CLOCK = 'Pass `now` in instead of reading the clock, so the logic stays testable.';

export default [
  ...config,
  {
    // Plan 9.4: domain logic never reads the clock.
    files: ['packages/shared/src/{progress,progression,schedule}/**/*.ts'],
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
];
