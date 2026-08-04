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
    //     this directory — `./types` is `dist/runtime/types.js` and `./shared`
    //     is `dist/runtime/shared.js`, so together with `src/module.ts` this
    //     covers the whole export map;
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

    'packages/nuxt-handler-errors': {
      ...nuxtModuleWorkspace,

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

      ignoreDependencies: [
        ...nuxtModuleWorkspace.ignoreDependencies,

        // Deliberate runtime dependencies with no source consumer *yet*: the
        // `h3` augmentation behind `event.$typedFetch`, the Nitro `InternalApi`
        // keys the generated map is written against, and the path handling the
        // emitter needs. They are declared now because what their ranges
        // protect is instance identity, which is a packaging decision rather
        // than a consequence of the first import (SPEC.md §7.2).
        //
        // Package-scoped for the same reason as the fixtures: the template
        // declares none of the three, so globbing them would hand every future
        // package a free pass on dependencies it never declared. Each entry
        // comes out the moment a source file imports it — the hint promotion
        // above makes leaving it in a failure.
        'h3',
        'nitropack',
        'pathe',
      ],
    },
  },
} satisfies KnipConfig
