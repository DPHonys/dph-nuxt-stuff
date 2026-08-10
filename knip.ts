import type { KnipConfig, WorkspaceProjectConfig } from 'knip'

/**
 * The Nuxt module shape, described once.
 *
 * Both entry points below are ones knip cannot discover by following imports,
 * because neither is reached by an import: the module entry is a *build* entry,
 * and the runtime tree reaches a consumer's app through the published subpath
 * specifiers and through the module's own registration calls. Both are
 * properties of the shape `templates/nuxt-module` scaffolds rather than of any
 * one package, which is why this is keyed on the `packages/*` glob below and
 * the next scaffolded package inherits it.
 *
 * knip resolves exactly one `workspaces` key per workspace — the most specific
 * match wins, and configs are not merged — so a package that needs anything of
 * its own has to restate this. Spreading the constant is that restatement, and
 * it keeps the shape itself defined in one place.
 */
const nuxtModuleWorkspace = {
  entry: [
    // The build entry. `nuxt-module-build build` compiles this to
    // `dist/module.mjs`, which is the `.` specifier; nothing imports it.
    'src/module.ts',

    // The runtime tree. Two different things live here and both arrive by path:
    //   - published subpath specifiers, which are declaration-emitted out of
    //     this directory — each is the `index` of its own directory, so
    //     `dist/runtime/{types,server,shared}/index.js` together with
    //     `src/module.ts` covers the whole export map;
    //   - anything the module hands to Nuxt at setup — `addPlugin`,
    //     `addServerHandler`, `addImports`, `addTemplate` — which reaches the
    //     consumer's app through registration rather than through an import.
    'src/runtime/**/*.{ts,vue}',
  ],

  // Scaffolded into every module package by `templates/nuxt-module`, imported
  // by neither `src/` nor `test/`, and both kept deliberately:
  //   - `@nuxt/schema` is a real type dependency of the published `.`
  //     specifier. `@nuxt/module-builder` emits a `dist/types.d.mts` whose
  //     first line is `import type { NuxtModule } from '@nuxt/schema'`; knip
  //     reads source, so it cannot see an import in a generated declaration.
  //   - `@nuxt/devtools` backs `devtools: { enabled: true }` in the playground,
  //     which is what the package's own `dev` script boots. Nuxt resolves it at
  //     dev-server startup, not through an import.
  ignoreDependencies: ['@nuxt/devtools', '@nuxt/schema'],
} satisfies WorkspaceProjectConfig

export default {
  // `**/.nuxt/**` is generated output: the fixture-app entries below would
  // otherwise drag `nuxt prepare`'s emitted `.d.ts` files into the analysis.
  ignore: ['templates/**', 'scaffolder/tests/fixtures/**', '**/.nuxt/**'],
  ignoreExportsUsedInFile: true,

  // Every ignore in this file is a judgement with a stated reason, and a stale
  // one is a defect — a dependency that quietly stopped being unused would keep
  // its exemption for free. knip emits a configuration hint as soon as an
  // ignored item suppresses nothing; this promotes that hint to a failure, so
  // an ignore cannot outlive the reason it was added for.
  //
  // The same promotion applies to an entry pattern that matches no file, which
  // is why nothing above claims a directory the scaffold does not create.
  treatConfigHintsAsErrors: true,

  rules: {
    catalog: 'off',
  },

  workspaces: {
    'packages/*': nuxtModuleWorkspace,

    'packages/nuxt-handler-errors': {
      ...nuxtModuleWorkspace,

      // Not the scaffold's pair: both inherited exemptions would suppress
      // nothing here — `test/unit/module-setup.test.ts` imports `@nuxt/schema`
      // from source, and knip resolves `@nuxt/devtools` as used in this
      // package — and an idle ignore fails the run via the hint promotion.
      ignoreDependencies: [],

      entry: [
        ...nuxtModuleWorkspace.entry,

        // The unit and e2e suites boot this fixture app through
        // @nuxt/test-utils, which reaches it by path (`rootDir`), never by
        // import. Package-scoped because the scaffold creates no
        // `test/fixtures/`, and a glob-level pattern matching nothing there
        // would fail the next scaffolded package on the hint promoted above.
        'test/fixtures/**/*.{ts,vue}',
      ],
    },
  },
} satisfies KnipConfig
