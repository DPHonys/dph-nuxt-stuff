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

  // Scaffolded into every module package, imported by neither `src/` nor
  // `test/`, and both kept deliberately: `@nuxt/schema` is a type dependency
  // of the generated `dist/types.d.mts`, and `@nuxt/devtools` is resolved by
  // the playground at dev-server startup.
  ignoreDependencies: ['@nuxt/devtools', '@nuxt/schema'],
} satisfies WorkspaceProjectConfig

export default {
  // `**/.nuxt/**` is generated output the fixture-app entries would otherwise
  // drag into the analysis.
  ignore: ['templates/**', 'scaffolder/tests/fixtures/**', '**/.nuxt/**'],
  ignoreExportsUsedInFile: true,

  // Fail the run when an ignore or entry pattern suppresses/matches nothing,
  // so an exemption cannot outlive the reason it was added for.
  treatConfigHintsAsErrors: true,

  rules: {
    catalog: 'off',
  },

  workspaces: {
    'packages/*': nuxtModuleWorkspace,

    'packages/nuxt-handler-errors': {
      ...nuxtModuleWorkspace,

      // Both inherited exemptions would suppress nothing in this package, and
      // an idle ignore fails the run via the hint promotion above.
      ignoreDependencies: [],

      entry: [
        ...nuxtModuleWorkspace.entry,

        // Fixture app booted by @nuxt/test-utils, reached by `rootDir` path,
        // never by import. Package-scoped because the scaffold creates no
        // `test/fixtures/`.
        'test/fixtures/**/*.{ts,vue}',
      ],
    },
  },
} satisfies KnipConfig
