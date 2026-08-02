import antfuConfig from '@antfu/eslint-config'
import oxlint from 'eslint-plugin-oxlint'
import oxlintConfig from './oxlint.config'

export default antfuConfig(
  {
    type: 'lib',
    // Oxfmt owns formatting.
    stylistic: false,
    formatters: false,
  },

  {
    name: 'project/overrides',
    rules: {
      // Oxfmt owns import order; leaving these on makes the two fight.
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-named-exports': 'off',
      'import/order': 'off',
      'import/consistent-type-specifier-style': 'off',
      'sort-imports': 'off',
      'jsonc/sort-keys': 'off',

      // Oxfmt keeps short content on one line and self-closes void elements.
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },

  // Oxlint cannot see Vue template usage, so ESLint owns unused variables.
  {
    name: 'project/unused-vars',
    files: ['**/*.?([cm])[jt]s?(x)', '**/*.vue'],
    ignores: ['**/*.md/**'],
    rules: {
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Keep last so ESLint only skips rules that Oxlint actually runs.
  ...oxlint.buildFromOxlintConfig(oxlintConfig)
)
