# Specify the generated module and repository contract

Type: grilling
Status: resolved
Blocked by: 01, 04

## Question

What exact files and meaningful starter behavior must every generated Nuxt module contain, what root workspace/catalog/Turbo/CI changes must support it, and which identifiers and metadata must be derived from the scaffold name and optional description?

The answer must reconcile current `main` with the useful structure on `module-template` and draw the boundary between package-local configuration and shared root configuration.

## Answer

Every Nuxt-module generated package has this exact tree:

```text
packages/<scaffold-name>/
├── LICENSE
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

Do not generate package-local lint, formatting, or Vitest configuration; Playwright or coverage scaffolding; handwritten server tsconfigs; changelogs; release scripts; nested workspace declarations; nested lockfiles; or package-local ignore files. The useful `module-template` shape is retained, but its product-specific behavior, placeholder README, empty browser-test layer, coverage and Prettier setup, manual server tsconfigs, and release additions are not.

### Naming and publication metadata

Derive one immutable naming context from the validated scaffold name and reuse it everywhere. Do not infer acronyms or prompt for another title. For `api-2-client`, the exact derivations are:

| Meaning                 | Derived value                        |
| ----------------------- | ------------------------------------ |
| Destination             | `packages/api-2-client`              |
| Published package       | `@dphonys/api-2-client`              |
| Nuxt `meta.name`        | `api-2-client`                       |
| Nuxt `configKey`        | `api2Client`                         |
| Runtime injection       | `$api2Client`                        |
| Display name            | `Api 2 Client`                       |
| Playground package      | `@dphonys/api-2-client-playground`   |
| Fixture package         | `@dphonys/api-2-client-test-fixture` |
| Default starter message | `Hello from Api 2 Client`            |

The manifest starts at version `0.0.1` and contains:

- `name`, `type: "module"`, MIT `license`, and `engines.node: ">=26.0.0"`;
- the supplied trimmed `description`, omitted entirely when the optional input is blank;
- keywords `nuxt`, `nuxt-module`, and the scaffold name;
- repository type `git`, URL `https://github.com/DPHonys/dph-nuxt-stuff.git`, and `directory: "packages/<scaffold-name>"`;
- Module Builder's `exports`, `main`, and `typesVersions` entries for `dist/module.mjs` and `dist/types.d.mts`;
- `files: ["dist"]` and `publishConfig.access: "public"`;
- no `private` flag and no package-level `workspaces` field.

Node 26 is the target even though it is still Current on this specification's 2026-08-02 snapshot; it is scheduled to enter LTS in October 2026 according to the [official Node.js release schedule](https://nodejs.org/uk/blog/announcements/evolving-the-nodejs-release-schedule). CI uses Node 26, and the documentation calls it Node 26 rather than claiming it is already LTS.

`LICENSE` is the standard MIT text with `Copyright (c) <scaffold-year> Daniel Petr Honys`. The year is obtained through an injected clock when the plan is prepared so tests remain deterministic.

### Meaningful starter behavior

Export Nuxt's conventional `ModuleOptions` interface with one typed optional `message` property. `src/module.ts` uses object-form `defineNuxtModule`, declares Nuxt compatibility `>=4.0.0`, defaults `message` to `Hello from <Display Name>`, copies the resolved value into public runtime config under the derived config key, and registers `src/runtime/plugin.ts`. The plugin reads that public runtime config and provides an object containing `message` as the derived `$<camelName>` injection.

The playground loads the published workspace package without overriding `message`, then renders the display name and injected default message. Its Nuxt config enables DevTools and uses `compatibilityDate: "latest"`. The fixture imports `src/module.ts` directly, configures a distinct test message through the derived config key, and renders `$<camelName>.message`. `test/basic.test.ts` starts that fixture through `@nuxt/test-utils/e2e`, fetches `/`, and asserts the exact override. This proves option flow, module and plugin registration, the derived runtime name, and SSR; it is an integration/E2E fixture test, not a unit test.

Generated output is working, not placeholder-only, but clearly hands ownership to the package developer. Add exactly three handoff markers:

- a TODO in `src/module.ts` to replace the starter option and setup with package-specific behavior;
- a TODO in `src/runtime/plugin.ts` to replace the starter injection with package-specific runtime behavior;
- a short README TODO callout to replace the starter behavior and its documentation before publishing.

Do not scatter TODOs through the playground or test. They remain an executable example and safety net until the developer deliberately replaces them alongside package behavior.

The README otherwise contains truthful, rendered sections for the title and optional description, pnpm installation, Nuxt module registration and configuration, use of the option and injection, an options table, repository-local development commands, and the MIT license. It has no fabricated features, unpublished-package badges, release notes, StackBlitz or documentation links, or publishing instructions.

### Package-local tooling

Use the standard Module Builder ESM scripts, adapted to this repository:

```json
{
  "build": "nuxt-module-build build",
  "prepack": "pnpm run build",
  "dev": "pnpm run dev:prepare && nuxt dev playground",
  "dev:build": "nuxt build playground",
  "dev:prepare": "nuxt-module-build build --stub && nuxt-module-build prepare && nuxt prepare playground",
  "lint": "eslint .",
  "typecheck": "pnpm run dev:prepare && vue-tsc --noEmit && vue-tsc --noEmit --project playground/tsconfig.json",
  "test": "vitest run",
  "test:watch": "vitest watch",
  "publint": "publint"
}
```

Self-preparation makes a filtered package typecheck work after a fresh install rather than relying on hidden prior state. Package `tsconfig.json` inherits both the generated Nuxt aliases and the root's strict TypeScript policy while excluding the independently checked playground:

```json
{
  "extends": ["./.nuxt/tsconfig.json", "../../tsconfig.json"],
  "exclude": ["dist", "node_modules", "playground"]
}
```

The later root base guarantees its strictness flags while retaining Nuxt aliases from the generated base. The child `exclude` replaces the root exclusion, so package source and tests remain included. The playground tsconfig is `{ "extends": "./.nuxt/tsconfig.json" }`.

`@nuxt/kit` is the sole runtime dependency. Development dependencies are `@nuxt/devtools`, `@nuxt/module-builder`, `@nuxt/schema`, `@nuxt/test-utils`, `@types/node`, `nuxt`, `publint`, `typescript`, `vitest`, and `vue-tsc`, all referenced through `catalog:`. The private playground depends on `@dphonys/<scaffold-name>: "workspace:*"` and `nuxt: "catalog:"`; the private fixture has no dependencies because its config imports the module source directly.

### Shared repository support

Install repository support once with the scaffolder implementation. A later scaffolding run creates only its generated package before the already-approved repository-root `pnpm install` updates `pnpm-lock.yaml`; it never repeatedly rewrites shared configuration.

The one-time root changes are:

- `pnpm-workspace.yaml`: retain `packages/*`, add `packages/*/playground`, and do not add fixtures as workspaces. Add catalog entries for the dependency baseline established by [Establish the current Nuxt 4 module baseline](01-research-current-nuxt-4-module-baseline.md), including the existing TypeScript native-bridge identity. Do not migrate unrelated root dependencies or versions merely to use the catalog.
- `tsconfig.json` and root `typecheck`: exclude `packages/**` from the plain root compiler invocation, then aggregate each generated package's Nuxt-aware `typecheck` through Turbo. Root source and generated packages remain covered without trying to resolve Nuxt virtual aliases under the plain root config.
- `turbo.json`: retain the existing tasks; add `test` with no persistent outputs and `publint` with `dependsOn: ["build"]` and no outputs. Extend build outputs from `dist/**` to both `dist/**` and `.output/**` so the same task covers Module Builder packages and nested playground workspaces.
- `package.json`: change root `typecheck` to `tsc --noEmit && turbo run typecheck`, add `test: "turbo run test"` and `publint: "turbo run publint"`, and set `check` to `pnpm typecheck && pnpm format && pnpm lint && pnpm test && pnpm build && pnpm publint`. The exact inclusion of the Scaffolder's own tests will be completed by [Define verification and acceptance](06-define-verification-and-acceptance.md); these commands fix the generated-workspace side now.
- `.github/workflows/ci.yml`: keep the focused existing check job, run the canonical full `pnpm check` gate under Node 26, and make preview publication depend on it. Do not copy the branch's separate empty Playwright, coverage-upload, or broad multi-job expansion.
- `.github/workflows/release.yml`: run the same full gate before the existing release operation. This is a verification addition, not a redesign of versioning or publishing.
- `.gitignore`: add shared `.nuxt/`, `.output/`, and `.nitro/` patterns, which apply at every depth. Do not add obsolete Playwright or coverage patterns.

Root Oxlint, ESLint, Oxfmt, TypeScript policy, pnpm catalog/workspace discovery, Turbo orchestration, and CI are repository support. The manifest, scripts, Nuxt-aware tsconfigs, module/runtime code, playground, fixture test, documentation, and license are the package-local contract.
