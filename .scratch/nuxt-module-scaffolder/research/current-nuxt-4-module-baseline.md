# Current Nuxt 4 module baseline

Research snapshot: 2026-08-02. The official starter was inspected at [`58f2338`](https://github.com/nuxt/starter/commit/58f2338da48bbc68e11fa10163a72e2d1a70ac0a); the local comparison uses `module-template` at `7fdea352` and `main` at `f2f8e43`.

## Recommendation

Use the current official Nuxt module starter as the structural baseline, adapted to this pnpm monorepo. A generated package should be an ESM module built by `@nuxt/module-builder`, contain one manual playground and one real `@nuxt/test-utils` consumer-fixture test, declare Nuxt `>=4.0.0` in module metadata, and pass type checking, linting, its test, a distribution build, and `publint`. Keep release execution at the repository root, as already decided.

This is a Nuxt 4+ template, not merely a renamed copy of `scroll-restorer`: all product behavior must be replaced by a neutral working option/runtime example that the fixture actually exercises.

## Authoritative package shape

The Nuxt 4 author guide directs module authors to the official starter. It defines `src/` as module source, `playground/` as a Nuxt consumer app for manual development, Vitest as the starter test runner, and `@nuxt/module-builder` as the distribution builder ([getting started](https://nuxt.com/docs/4.x/guide/modules/getting-started), [official starter](https://github.com/nuxt/starter/tree/module)). Module Builder expects a default `defineNuxtModule` export and exported `ModuleOptions` from `src/module.ts`; it transforms `src/runtime/**` and emits `dist/module.mjs`, `dist/module.json`, `dist/types.d.mts`, and `dist/runtime/**` ([Module Builder project structure](https://github.com/nuxt/module-builder#project-structure)).

Recommended generated tree:

```text
packages/<scaffold-name>/
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── module.ts
│   └── runtime/
│       └── plugin.ts
├── playground/
│   ├── app.vue
│   ├── nuxt.config.ts
│   ├── package.json
│   └── tsconfig.json
└── test/
    ├── basic.test.ts
    └── fixtures/
        └── basic/
            ├── app.vue
            ├── nuxt.config.ts
            └── package.json
```

The root-level `app.vue` files deliberately follow the current official module starter. Nuxt 4 supports its new `app/` source layout but retains backward compatibility for the old layout, so this is current and valid rather than a Nuxt 3 compatibility hack ([Nuxt 4 upgrade guide](https://nuxt.com/docs/4.x/getting-started/upgrade)). Do not add handwritten `server/tsconfig.json` files: Nuxt 4 generates context-specific app, server, shared, and node TypeScript configs.

`defineNuxtModule` should use object syntax with `meta`, `defaults`, and `setup`. This gives option merging, install-once identity, compatibility checks, hook registration, type inference, and Module Builder integration. `meta.compatibility.nuxt` is the supported-version contract ([module anatomy](https://nuxt.com/docs/4.x/guide/modules/module-anatomy)). For this effort:

```text
meta: {
  name: '<scaffold-name>',
  configKey: '<camelName>',
  compatibility: { nuxt: '>=4.0.0' },
}
```

Nuxt says `meta.name` is usually the npm package name. The unscoped value above preserves the already-agreed naming contract (`analytics-proxy` versus `@dphonys/analytics-proxy`); it is a conscious repository convention, not an official requirement.

Runtime code belongs below `src/runtime/` and must be registered explicitly with Nuxt Kit. Published runtime files cannot rely on their own package being scanned for auto-imports; import runtime helpers explicitly from `#imports`/`#app`. If later templates add convention-based components, composables, or pages, place them under `src/runtime/app/**` for Nuxt 4-aware type checking ([module anatomy](https://nuxt.com/docs/4.x/guide/modules/module-anatomy), [runtime recipes](https://nuxt.com/docs/4.x/guide/modules/recipes-basics)). Prefix exposed config, injections, composables, components, and routes with the generated module name ([module best practices](https://nuxt.com/docs/4.x/guide/modules/best-practices)).

## Package manifest and dependency baseline

Required build/export metadata, matching Module Builder and the official starter:

```json
{
  "name": "@dphonys/<scaffold-name>",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/types.d.mts",
      "import": "./dist/module.mjs"
    }
  },
  "main": "./dist/module.mjs",
  "typesVersions": {
    "*": { ".": ["./dist/types.d.mts"] }
  },
  "files": ["dist"],
  "publishConfig": { "access": "public" }
}
```

The export shape is Module Builder's documented minimum ([Module Builder](https://github.com/nuxt/module-builder#packagejson)). `publishConfig.access` is a repository-specific addition because new scoped npm packages are restricted by default unless published with public access ([npm scoped-package guidance](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)). Also render `version`, description, MIT license, keywords, and a monorepo-aware `repository` object with `directory: "packages/<scaffold-name>"`.

The current official starter dependency snapshot is visible in its [`package.json`](https://github.com/nuxt/starter/blob/58f2338da48bbc68e11fa10163a72e2d1a70ac0a/package.json). Use these as the initial catalog ranges, allowing Renovate to own future refreshes:

| Role                          | Package                | Baseline                                             |
| ----------------------------- | ---------------------- | ---------------------------------------------------- |
| runtime dependency            | `@nuxt/kit`            | `^4.5.1`                                             |
| development                   | `@nuxt/devtools`       | `^3.3.1`                                             |
| development                   | `@nuxt/module-builder` | `^1.0.3`                                             |
| development                   | `@nuxt/schema`         | `^4.5.1`                                             |
| development                   | `@nuxt/test-utils`     | `^4.1.0`                                             |
| development                   | `@types/node`          | `latest` (official starter policy)                   |
| development                   | `nuxt`                 | `^4.5.1`                                             |
| development                   | `typescript`           | repo's existing native-bridge override/catalog entry |
| development                   | `vitest`               | `^4.1.10`                                            |
| development                   | `vue-tsc`              | `^3.3.8`                                             |
| production-readiness addition | `publint`              | `^0.3.22`                                            |

The starter also carries its standalone ESLint stack and `changelogen`. This monorepo already owns ESLint/Oxlint/Oxfmt and release tooling at the root, so generated packages should inherit those rather than install competing package-local configs or release scripts. `publint` is an intentional addition not present in the starter; it validates the built package files and export map ([publint](https://publint.dev/docs/)). Nuxt 4's current installation baseline is Node 22 or newer, so any generated `engines.node` should be `>=22.0.0` if the repo chooses to emit it ([Nuxt installation requirements](https://nuxt.com/docs/4.x/getting-started/installation)).

Use one root pnpm catalog for these ranges and `catalog:` references in generated manifests. Because pnpm workspace discovery belongs to the root, add `packages/*/playground` (and fixtures only if their manifests are intended as workspaces) to `pnpm-workspace.yaml`; do not rely on the package-level npm `workspaces` field copied from a standalone starter.

## Script and verification baseline

Adapt the official starter scripts to pnpm and the root Turbo task names ([starter package manifest](https://github.com/nuxt/starter/blob/58f2338da48bbc68e11fa10163a72e2d1a70ac0a/package.json), [`nuxt build-module`](https://nuxt.com/docs/4.x/api/commands/build-module)):

```json
{
  "scripts": {
    "build": "nuxt-module-build build",
    "prepack": "pnpm run build",
    "dev": "pnpm run dev:prepare && nuxt dev playground",
    "dev:build": "nuxt build playground",
    "dev:prepare": "nuxt-module-build build --stub && nuxt-module-build prepare && nuxt prepare playground",
    "lint": "eslint .",
    "typecheck": "vue-tsc --noEmit && pnpm --dir playground exec vue-tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "publint": "publint"
  }
}
```

Preparation must run before first development/type-check use so `.nuxt` files exist. Verification order should be prepare, typecheck/lint, test, build, then `publint`; `publint` must see `dist`. The generated package should not publish, tag, or push.

Nuxt's official module test workflow is a consumer fixture under `test/fixtures/*`, `setup({ rootDir })` from `@nuxt/test-utils/e2e`, interaction through helpers such as `$fetch`, and an assertion on observable output ([module testing guide](https://nuxt.com/docs/4.x/guide/modules/testing), [starter test](https://github.com/nuxt/starter/blob/module/test/basic.test.ts)). Name this an integration/E2E fixture test, not a unit test. A package-local Vitest config is unnecessary for the single standard fixture test.

The neutral example should prove more than installation: one typed option should change a name-prefixed, consumer-visible runtime value registered by the plugin; the playground displays it, and the fixture config overrides it and asserts the rendered result. This demonstrates option flow, runtime registration, SSR, and generated naming without embedding product behavior.

## `module-template` disposition

| Area                                              | Decision                               | Reason                                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/module.ts`, `src/runtime/plugin.ts`          | Retain shape; replace behavior         | Matches the starter and Module Builder. Add `compatibility.nuxt` and a tested neutral example.                                                                   |
| ESM exports, `main`, `typesVersions`, `files`     | Retain                                 | Matches Module Builder output exactly.                                                                                                                           |
| Playground and fixture                            | Retain, simplify, rename               | They are official authoring/testing patterns. Keep a separate playground manifest with `workspace:*`; flatten `test/unit/basic.test.ts` to `test/basic.test.ts`. |
| `dev`, `dev:build`, `dev:prepare`, build/prepack  | Retain with pnpm/repo naming           | Matches current starter behavior.                                                                                                                                |
| Dependencies                                      | Update                                 | Replace the branch's Nuxt 4.3-era catalog with the table above; add `vue-tsc`; keep the repository TypeScript override coherent.                                 |
| `compatibilityDate: '2024-04-03'`                 | Update to `'latest'` in the playground | This is what the current official starter uses; fixtures need no date unless their behavior depends on one.                                                      |
| README                                            | Replace                                | Render package/display/config names and a real usage/options example; remove starter placeholders and scroll-restorer language.                                  |
| Playwright config/dependency and empty `test/e2e` | Remove                                 | The official baseline uses Test Utils plus Vitest; empty browser tooling proves nothing. Add browser tests later when a module has browser-only behavior.        |
| Coverage config and `@vitest/coverage-v8`         | Remove from baseline                   | Not present in the current starter and no coverage threshold was requested.                                                                                      |
| Manual `server/tsconfig.json` files               | Remove                                 | Nuxt 4 generates context-specific configs.                                                                                                                       |
| Package-local Prettier formatting                 | Remove                                 | The current repo standard is root Oxfmt.                                                                                                                         |
| Package release script                            | Remove                                 | Automated release/versioning is explicitly outside this effort.                                                                                                  |

## Current `main` integration gaps

`main` has no package yet and its root `pnpm-workspace.yaml` only includes `packages/*`. Its `check` currently runs a root TypeScript invocation plus formatting/linting, while Turbo defines only build, dev, typecheck, and lint tasks. Therefore implementation must also make root verification discover generated package preparation, tests, builds, and `publint`, and must add the nested playground workspace pattern/catalog. Otherwise the generated package can look correct while CI never executes its module-specific checks.

These are repository integration requirements, not reasons to copy the broad lint/CI/release changes from `module-template` wholesale.
