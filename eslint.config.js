const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['public/**', 'coverage/**', 'mafry_movil/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$' }],
    },
  },
];
