import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: [
    'eslint',
    'typescript',
    'unicorn',
    'oxc',
    'import',
    'promise',
    'vue',
  ],
  categories: {
    correctness: 'error',
    suspicious: 'error',
  },
  env: {
    builtin: true,
    browser: true,
    node: true,
    es2024: true,
  },
  ignorePatterns: [
    '.nuxt',
    '.output',
    '.nitro',
    'dist',
    '.turbo',
    'node_modules',
    'pnpm-lock.yaml',
    // Deliberately non-compiling type fixtures. See packages/*/SPEC.md §9.9.
    // The globs are required: these are gitignore-style patterns, so a bare
    // `test/types/neg` anchors to this config's directory and would never match
    // the copy inside a package.
    '**/test/types/neg/**',
  ],
  rules: {
    'import/no-duplicates': 'error',
    'no-unused-vars': 'off',
    'no-underscore-dangle': 'off',
  },
  overrides: [
    {
      files: ['**/*.vue'],
      rules: {
        'import/first': 'off',
      },
    },
  ],
})
