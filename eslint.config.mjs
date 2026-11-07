import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['main.js', 'docs/', 'esbuild.config.mjs'],
  },
  {
    // Declaration files intentionally re-declare library internals.
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Test code and mocks conventionally prefix unused parameters (stub
    // method signatures, jest.fn() wrappers) with an underscore. The mock
    // shims re-export CommonJS packages for jest's module mapper.
    files: ['src/__tests__/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
