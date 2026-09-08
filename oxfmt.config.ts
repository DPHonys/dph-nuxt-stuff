import { defineConfig } from 'oxfmt'

export default defineConfig({
  ignorePatterns: [
    // Vendored plugin keeps upstream formatting so it stays diffable.
    'tools/oxlint/anti-slop/**',
    // `pnpm version -r` rewrites the ledger on every release and quotes its
    // keys its own way. Formatting it here only makes the release gate fail
    // on generated output, so the generator keeps ownership of the file.
    '.changeset/ledger.yaml',
  ],
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 80,
  arrowParens: 'always',
  endOfLine: 'lf',
  insertFinalNewline: true,
  sortImports: {
    newlinesBetween: false,
    internalPattern: ['^#app/.*', '^#shared/.*', '^#components/.*', '^~/.*'],
    customGroups: [
      { groupName: 'nuxt-app', elementNamePattern: ['#app', '#app/**'] },
      {
        groupName: 'nuxt-shared',
        elementNamePattern: ['#shared', '#shared/**'],
      },
      {
        groupName: 'nuxt-components',
        elementNamePattern: ['#components', '#components/**'],
      },
      { groupName: 'app-alias', elementNamePattern: ['~', '~/**'] },
    ],
    groups: [
      ['builtin', 'external'],
      'nuxt-app',
      'nuxt-shared',
      'nuxt-components',
      'app-alias',
      ['parent', 'sibling', 'index'],
      'style',
      'unknown',
    ],
  },
})
