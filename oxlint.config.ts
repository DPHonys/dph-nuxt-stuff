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
  jsPlugins: [
    { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' },
  ],
  ignorePatterns: [
    '.claude/**',
    'tools/oxlint/anti-slop/**',
    '.nuxt',
    '.output',
    '.nitro',
    'dist',
    '.turbo',
    'node_modules',
    'pnpm-lock.yaml',
  ],
  rules: {
    'import/no-duplicates': 'error',
    'no-unused-vars': 'off',
    'no-underscore-dangle': 'off',

    // Vendored from https://github.com/dmmulroy/anti-slop.
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-conditional-empty-object-spread': 'error',
    'anti-slop/no-known-value-widening': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-object-parameters': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-runtime-typeof': 'error',
    'anti-slop/no-shape-in-symbol-names': 'error',
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',
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
