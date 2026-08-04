# Nuxt Handler Errors

Declare a Nitro handler’s expected failures once and infer them at every call site from the route path.

> **Not usable yet.** The packaging foundation is in place — the module registers,
> declares its compatibility range, and publishes its three specifiers — but the
> surface described in [`SPEC.md`](./SPEC.md) is still being built. This README
> documents what exists today; the usage guide lands with the API.

## Installation

Install the module with pnpm:

```sh
pnpm add @dphonys/nuxt-handler-errors
```

## Registration

Register the module in `nuxt.config.ts`. It takes no options today:

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors'],
})
```

The module supports Nuxt `>=4.5.0 <5.0.0`. The ceiling is deliberate: Nuxt 5
moves to h3 v2 / Nitro 3, which this module has not been measured against.

## Specifiers

The bare `.` specifier is import-protected by Nuxt in every context, so nothing
is ever hand-written from it. Everything you import comes from one of two
subpaths:

| Specifier                             | Holds                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `@dphonys/nuxt-handler-errors`        | the Nuxt module itself, for `nuxt.config.ts`                                                   |
| `@dphonys/nuxt-handler-errors/types`  | the public type surface, and the build-time augmentation target for the generated error map    |
| `@dphonys/nuxt-handler-errors/shared` | side-agnostic runtime values, importable from the client, the server and your `shared/` folder |

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-handler-errors dev
pnpm --filter @dphonys/nuxt-handler-errors typecheck
pnpm --filter @dphonys/nuxt-handler-errors test
pnpm --filter @dphonys/nuxt-handler-errors build
pnpm --filter @dphonys/nuxt-handler-errors publint
```

`dev` builds the module for real before starting the playground: two of the
three specifiers point inside `dist/runtime/`, and `nuxt-module-build --stub`
replaces that directory with a symlink to source, which breaks them.

## License

Licensed under the [MIT License](./LICENSE).
