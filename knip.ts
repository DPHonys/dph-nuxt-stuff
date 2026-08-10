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
  ignore: ['templates/**', 'scaffolder/tests/fixtures/**'],
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

    'packages/nuxt-handler-errors-old': {
      ...nuxtModuleWorkspace,

      // Not the scaffold's pair: `@nuxt/schema` is dropped from the inherited
      // list because this package *does* import it from source —
      // `test/unit/module-setup.test.ts` types the loaded Nuxt instance with
      // it —
      // so the scaffold-shape exemption would suppress nothing here and the
      // hint promoted above would fail the run.
      ignoreDependencies: ['@nuxt/devtools'],

      entry: [
        ...nuxtModuleWorkspace.entry,

        // The compile-time assertion harness's fixtures. The harness compiles
        // these one at a time by relative path through the compiler API rather
        // than importing them, and the `neg/` half deliberately does not
        // compile at all (SPEC.md §9.2). Naming the fixtures rather than
        // ignoring `test/types/**` is what keeps their own imports followed:
        // `test/types/vocabulary.ts` is reported unused the day no fixture uses
        // it.
        //
        // Package-scoped because the harness is this package's, not the
        // scaffold's — `templates/nuxt-module` creates no `test/types/`, and a
        // glob-level pattern matching nothing there would fail the next
        // scaffolded package on the hint promoted above.
        'test/types/{pos,neg}/**/*.ts',
      ],
    },
  },
} satisfies KnipConfig
