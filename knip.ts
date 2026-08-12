import type { KnipConfig, WorkspaceProjectConfig } from 'knip'

/**
 * The Nuxt module shape, described once. knip resolves exactly one
 * `workspaces` key per workspace (most specific wins, no merging), so a
 * package that needs anything of its own restates this by spreading it.
 */
const nuxtModuleWorkspace = {
  // Entries knip cannot discover by following imports: `src/module.ts` is the
  // build entry, and the runtime tree reaches a consumer's app through the
  // published subpath specifiers and the module's registration calls
  // (`addPlugin`, `addServerHandler`, ...), never through an import.
  entry: ['src/module.ts', 'src/runtime/**/*.{ts,vue}'],

  // A negated `project` pattern, not `ignore`: `ignore` only mutes findings
  // while the generated tree still enters the module graph.
  project: ['**/*.{ts,vue}', '!**/.nuxt/**'],

  // Scaffolded into every module package, imported by neither `src/` nor
  // `test/`, and both kept deliberately: `@nuxt/schema` is a type dependency
  // of the generated `dist/types.d.mts`, and `@nuxt/devtools` is resolved by
  // the playground at dev-server startup.
  ignoreDependencies: ['@nuxt/devtools', '@nuxt/schema'],
} satisfies WorkspaceProjectConfig

/**
 * A package's playground, described once for the same reason. Playgrounds are
 * their own workspace, so the package-level exclusion above does not reach
 * their generated `.nuxt` tree.
 */
const playgroundWorkspace = {
  project: ['**/*.{ts,vue}', '!.nuxt/**'],
} satisfies WorkspaceProjectConfig

export default {
  ignore: ['templates/**', 'scaffolder/tests/fixtures/**'],
  ignoreExportsUsedInFile: true,

  // Fail the run when an ignore or entry pattern suppresses/matches nothing,
  // so an exemption cannot outlive the reason it was added for.
  treatConfigHintsAsErrors: true,

  rules: {
    catalog: 'off',
  },

  workspaces: {
    'packages/*': nuxtModuleWorkspace,

    'packages/*/playground': playgroundWorkspace,

    'packages/nuxt-handler-errors': {
      ...nuxtModuleWorkspace,

      // The inherited `@nuxt/schema` exemption would suppress nothing in this
      // package, and an idle ignore fails the run via the hint promotion above.
      ignoreDependencies: ['@nuxt/devtools'],

      entry: [
        ...nuxtModuleWorkspace.entry,

        // Fixture app booted by @nuxt/test-utils, reached by `rootDir` path,
        // never by import. Package-scoped because the scaffold creates no
        // `test/fixtures/`.
        'test/fixtures/**/*.{ts,vue}',
        // The fixture glob above would otherwise match the app's generated
        // `.nuxt/**/*.d.ts` as entries.
        '!test/fixtures/**/.nuxt/**',
      ],
    },

    'packages/nuxt-handler-validation/playground': {
      ...playgroundWorkspace,

      // Compiler-asserted, never imported: `vue-tsc --project
      // playground/tsconfig.json` is what runs it. It has to live in an app
      // because the config typing it asserts only exists in a generated
      // `.nuxt`.
      entry: ['module-options.check.ts'],
    },
  },
} satisfies KnipConfig
