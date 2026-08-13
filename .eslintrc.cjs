module.exports = {
  root: true,
  env: { es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    '*.config.js',
    '*.config.cjs',
    'apps/*/dist/',
    'apps/*/dev-dist/',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',

    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],

    'no-empty': ['error', { allowEmptyCatch: true }],

    'no-undef': 'off',
    'no-redeclare': 'off',

    'no-extra-semi': 'off',
  },
  overrides: [
    {
      files: ['apps/backend/**/*.ts'],
      env: { node: true },
    },
    {
      files: ['apps/hub/**/*.{ts,tsx}'],
      env: { browser: true },
      plugins: ['react-hooks'],
      rules: {
        'react-hooks/rules-of-hooks': 'error',

        'react-hooks/exhaustive-deps': 'warn',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', 'apps/backend/src/test-support/**/*.ts'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
}
