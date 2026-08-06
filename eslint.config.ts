import antfuConfig from '@antfu/eslint-config'
import oxlint from 'eslint-plugin-oxlint'
import oxlintConfig from './oxlint.config'

export default antfuConfig(
  {
    type: 'lib',
    vue: true,
    // Oxfmt owns formatting.
    stylistic: false,
    formatters: false,
  },

  // A package's SPEC.md is a design document. Its `ts` fences carry illustrative
  // signatures with elisions and shorthand that no parser accepts, and reflowing
  // them would rewrite the document the implementation is measured against. Only
  // the fenced code is exempt; the Markdown itself is still linted.
  {
    name: 'project/design-spec-code-fences',
    ignores: ['**/SPEC.md/**'],
  },

  // Negative type fixtures are deliberately non-compiling — they exist to
  // produce one specific diagnostic each, which the compile-time harness reads
  // back through its own program. They are excluded from their package's
  // `tsconfig` for the same reason. See packages/*/SPEC.md §9.9.
  {
    name: 'project/negative-type-fixtures',
    ignores: ['**/test/types/neg/**'],
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

      // Doc comments here use Markdown emphasis, and a line whose content
      // starts with `*word*` reads to this rule as a doubled asterisk. Its
      // autofix then eats the opening `*`, silently corrupting the emphasis —
      // `*after*` becomes `after*` — across any `lint:fix` run.
      'jsdoc/no-multi-asterisks': 'off',
    },
  },

  // Repository support predeclares package catalog entries before the first
  // generated package consumes them. Keep existing root dependency ownership
  // unchanged while still enforcing catalog use in generated packages.
  // TODO: Migrate the existing root dependency versions into the central pnpm
  // catalog, switch the root manifest to `catalog:`, and remove this exception.
  // Remove the unused-item exception once generated packages consume every
  // predeclared Nuxt catalog entry.
  {
    name: 'project/root-catalog-policy',
    files: ['package.json'],
    rules: {
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    name: 'project/predeclared-catalog-policy',
    files: ['pnpm-workspace.yaml'],
    rules: {
      'pnpm/yaml-no-unused-catalog-item': 'off',
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
