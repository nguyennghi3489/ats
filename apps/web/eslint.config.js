import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import root from '../../eslint.config.js';

export default tseslint.config(
  ...root,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    // Placeholder views keep single-word names (Home/NotFound) out of the root component.
    files: ['src/App.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  prettier,
);
