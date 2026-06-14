module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended'
  ],
  env: {
    node: true,
    es2022: true,
    browser: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  settings: {
    'import/resolver': {
      node: true
    }
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'import/order': [
      'warn',
      {
        groups: ['type', 'builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'never',
        alphabetize: { order: 'asc', caseInsensitive: true }
      }
    ],
    'import/no-duplicates': 'warn'
  },
  overrides: [
    {
      // Exploration 0181: the consolidated @xnetjs/cloud package keeps its module
      // seams crisp. A module may only reach a sibling module through its public
      // index (e.g. `../billing`), never into a sibling's internals
      // (`../billing/ledger`). Same-module imports and the entitlements contract
      // are unaffected.
      files: ['packages/cloud/src/**/*.ts'],
      excludedFiles: ['**/*.test.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../*/*', '../../*/*'],
                message:
                  'Import a sibling @xnetjs/cloud module via its index (e.g. "../billing"), not its internals.'
              }
            ]
          }
        ]
      }
    }
  ],
  ignorePatterns: ['dist', 'node_modules', '*.js', '*.cjs', '!.storybook', '!.storybook/**']
}
