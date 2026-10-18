import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
