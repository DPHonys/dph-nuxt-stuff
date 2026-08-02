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
