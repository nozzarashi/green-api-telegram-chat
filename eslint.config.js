import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';

const layers = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.sites-runtime/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs}', '*.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  ...layers.map((layer, index) => ({
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: layers.slice(index + 1).map((upper) => ({
            group: [`@/${upper}`, `@/${upper}/**`],
            message: `FSD: ${layer} cannot depend on the higher ${upper} layer.`,
          })),
        },
      ],
    },
  })),
);
