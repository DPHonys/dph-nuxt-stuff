# Internals

Notes for whoever maintains this package. Nothing here is public surface; the README is the authority for what an app author may rely on.

## Nuxt 5 seams

Each mechanism Nuxt 5 replaces sits behind one function. Everything else in the package calls through it, so the Nuxt 5 adapter rewrites the function bodies and touches no caller.

| Seam                      | Function                       | File                          | Nuxt 4 today                                              | Nuxt 5                                 |
| ------------------------- | ------------------------------ | ----------------------------- | --------------------------------------------------------- | -------------------------------------- |
| Handler construction      | `makeEventHandler(run)`        | `src/runtime/shared/h3.ts`    | h3 v1 `defineEventHandler`                                | h3 v2 `defineHandler`                  |
| Error construction        | `httpError(input)`             | `src/runtime/shared/h3.ts`    | h3 v1 `createError`; `message` set, `statusMessage` never | h3 v2 `HTTPError`; `data` stays nested |
| Nitro plugin registration | `addRuntimeServerPlugin(path)` | `src/build/server-plugins.ts` | kit `addServerPlugin`                                     | kit `addNitroPlugin` variants          |

Neither runtime name may be an h3 v2 export: Nuxt 5 auto-imports every lowercase one.

## Shared plumbing

- **The `devChecks` flag** (`src/runtime/server/dev-checks.ts`): starts as `import.meta.dev`, and the Nitro plugin `src/runtime/server/plugins/dev-checks.ts`, registered only when the app sets `devChecks: false`, turns it off.

## errors

- **Declaration-time checks** (`src/runtime/server/errors/declaration.ts`): `resolveErrors` runs each rule over every entry before the next rule starts: reserved tag, then a schema that is not a Standard Schema, then a status outside 400 to 599, then a key an entry does not take. `defineError` checks its one-key map the same way. Every refusal is a `declarationFault`, a plain `Error` with the `[better-handler]` prefix.
- **The Fail helper** (`src/runtime/server/errors/fail.ts`): returns an `Error` subclass with `_tag` and the fields as own enumerable properties, defined rather than assigned so a field named `message`, `name`, `stack` or `cause` is the field. Its tag lookup is prototype-less. A call the types would refuse is a `developerFault`, a plain `500` with no `data`.
