import { defineConfig } from 'oxfmt'

export default defineConfig({
  // Vendored plugin keeps upstream formatting so it stays diffable.
  ignorePatterns: ['tools/oxlint/anti-slop/**'],
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
