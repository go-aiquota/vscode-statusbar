'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', '.vscode-test/**', '*.vsix'] },
  js.configs.recommended,
  {
    languageOptions: { sourceType: 'commonjs', ecmaVersion: 2022, globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
