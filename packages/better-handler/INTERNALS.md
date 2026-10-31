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
- **The composing wrapper** (`src/runtime/server/define-better-event-handler.ts`): `defineBetterEventHandler` holds the errors half for now. At declaration it resolves the `errors` map and builds the Fail helper once; per request it hands the Handler a fresh `{ fail }` context and answers whatever the Handler throws through the boundary. The io half and the returned handler's brands extend this same function.
- **Recognition at the boundary** (`src/runtime/server/errors/boundary.ts`): a thrown value whose string `_tag` (read by property access, so a prototype's counts) is a declared key goes out through `httpError` with the declared status, the tag as `message`, `data` = `{ _tag, ...own enumerable fields }` and the thrown value as `cause`, so an error hook or a reporter sees the stack of the line that raised it; h3 never sends a cause. Function-valued fields are left out, as JSON would leave them out, which also keeps a `toJSON` field from replacing the whole of `data`. Everything else, an undeclared tag included, is rethrown as it was thrown.
- **The two errors development checks**, behind the `devChecks` flag and each a `developerFault`: the thrown-fields check validates the fields alone against the entry's schema and, when that fails, the whole Tagged error, `_tag` included, reporting that second attempt's issues; so a strict schema that does not list `_tag` passes, as does a schema that requires `_tag` (an Effect error class's does), and an Effect field named `message`, which Effect keeps non-enumerable, never goes out and is reported, awaiting an asynchronous one and discarding its output; the undeclared-tag check refuses a string `_tag` the route does not declare, naming it and the declared tags.
- **Fields are the schema's input** (`EntryInput` in `src/runtime/types/errors/declaration.ts`): the Fail helper's fields, the `_tag` literal check and the fields guard all read `InferInput`, never `InferOutput`. The wire carries the fields as they were thrown and the development check validates that thrown value, so a transforming schema's output is neither raised nor sent.
- **The fields guard** (`FieldsRule` in `src/runtime/types/errors/declaration.ts`): a schema input field holding a `bigint` or a `symbol`, at any depth, is refused at the key. Functions are not refused and `toJSON` is not reserved: a hand-written schema's type may carry methods, `toJSON` among them, which live on a prototype and never go out, so refusing them would refuse a class-typed declaration.
- **The server recognizer** (`src/runtime/server/errors/recognize-known-error.ts`): reads the error's own `data` through `taggedOf` (`src/runtime/shared/errors/tagged.ts`), one depth only, so a callee's Known error a caller let escape is not recognised.
