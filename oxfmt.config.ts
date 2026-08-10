import { defineConfig } from 'oxfmt'

export default defineConfig({
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
  // A package's SPEC.md is a design document, and its `ts` fences carry
  // illustrative signatures rather than source. Reflowing them would rewrite the
  // document the implementation is measured against.
  // `to-delete/` is retired code awaiting deletion; nothing maintains it.
  ignorePatterns: ['**/SPEC.md', 'to-delete'],
})
