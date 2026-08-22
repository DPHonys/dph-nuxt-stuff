import type { KnipConfig, WorkspaceProjectConfig } from 'knip'

// knip resolves exactly one `workspaces` key per workspace (most specific wins,
// no merging), so a package needing anything of its own spreads these.

const nuxtModuleWorkspace = {
  // Entries knip cannot reach by following imports: the build entry, the
  // runtime tree a consumer gets through published subpaths and the module's
  // registration calls, and the fixture apps booted by path.
  entry: [
    'src/module.ts',
    'src/runtime/**/*.{ts,vue}',
    'test/fixtures/**/*.{ts,vue}',
    // The fixture glob would otherwise match a generated `.nuxt/**/*.d.ts`.
    '!test/fixtures/**/.nuxt/**',
  ],

  // A negated `project` pattern, not `ignore`: `ignore` only mutes findings
  // while the generated tree still enters the module graph.
  project: ['**/*.{ts,vue}', '!**/.nuxt/**'],

  // Scaffolded, imported by nothing, both kept: `@nuxt/schema` types the
  // generated `dist/types.d.mts`, `@nuxt/devtools` is resolved at dev startup.
  ignoreDependencies: ['@nuxt/devtools', '@nuxt/schema'],
} satisfies WorkspaceProjectConfig

// Playgrounds are their own workspace, so the exclusion above does not reach
// their generated `.nuxt` tree.
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

      // The inherited `@nuxt/schema` exemption would suppress nothing here, and
      // an idle ignore fails the run via the hint promotion above.
      ignoreDependencies: ['@nuxt/devtools'],

      entry: [
        ...nuxtModuleWorkspace.entry,

        // The `/internals/build` entry: a second rollup input declared in
        // `build.config.ts`, reachable only through `exports`.
        'src/internals/**/*.ts',
      ],
    },

    'packages/nuxt-handler-validation': {
      ...nuxtModuleWorkspace,

      // As above: this package's suites import `@nuxt/schema`'s types.
      ignoreDependencies: ['@nuxt/devtools'],

      entry: [
        ...nuxtModuleWorkspace.entry,

        // Deliberately broken sources, compiled by path by
        // `test/types/compile-harness.ts` so a suite can assert on their
        // diagnostics. The package tsconfig excludes them for the same reason.
        'test/types/fixtures/**/*.ts',
      ],
    },

    'packages/nuxt-handler-validation/playground': {
      ...playgroundWorkspace,

      // Compiler-asserted by `vue-tsc`, never imported. It lives in an app
      // because the config typing it asserts only exists in a generated
      // `.nuxt`.
      entry: ['module-options.check.ts'],
    },
  },
} satisfies KnipConfig
