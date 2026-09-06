# @dphonys/nuxt-typed-handler

## 0.1.0

### Minor Changes

- Initial release. `@dphonys/nuxt-typed-handler` is one Nuxt module installed instead of `@dphonys/nuxt-handler-errors` and `@dphonys/nuxt-handler-validation`, composing both through their `internals/*` entries. `defineTypedEventHandler({ validate, errors }, fn)` declares a route's request schemas and its expected failures in one place and hands the handler one flat context - the validated sources, plus local `errors` factories when errors were declared - with a built-in `validation-failed` variant that every validating route carries and no route may declare. The Typed fetch family (`useTypedFetch`, `useLazyTypedFetch`, `useRequestTypedFetch`, `useTypedAsyncData`, `useLazyTypedAsyncData`, `$typedFetch` with `.try`, and `event.$typedFetch`) types every call site per route and method for what it may send - `body` and `query` from the schemas' input types - and for what it can fail with. Both parents' public surfaces are re-exported from `/server`, `/shared` and `/types`, so an app imports everything from one package; both parents are pinned exactly, and a project lists this module or them, never both.

  Select reusable `defineError` singles and groups in an `errors` array, using spread or `.pick()`, then `throw errors.userExists(input)`. Error tags are kebab-case and each factory is the tag's camelCase form, so `'user-exists'` is thrown as `errors.userExists(input)`. A `payload` is a Standard Schema, validated at runtime with its transformed output exposed as flat client fields, or absent, in which case the factory takes no argument. Factories return finished errors synchronously; schemas must validate synchronously.

- Handler-local typed error factories: declare `{ errors: [...userErrors] }`, receive `{ errors }` in the handler context, and write `throw errors.conflict(input)`. `defineError` declares singles and groups; groups spread into the `errors` array and narrow with `.pick()`. Tags are kebab-case, such as `user-not-found`, checked at compile time and at declaration; each factory is the tag's camelCase form, `errors.userNotFound`.

  A definition's optional `payload` is a Standard Schema, validated synchronously when the factory is called; an asynchronous schema throws a `TypeError` from the factory. A factory takes the schema's input and the client receives its output as flat fields such as `e.email`, beside `tag` and `status`. A definition without `payload` yields a zero-argument factory. Invalid schema payloads answer an unmarked 500; a factory's result is a finished error to throw.

  The generated per-endpoint error maps, exhaustive matching, native success responses, and channel gating work over these declarations unchanged. The umbrella keeps its validated context properties and its built-in `validation-failed` variant.

### Patch Changes

- Updated dependencies:
  - @dphonys/nuxt-handler-errors@0.5.0
  - @dphonys/nuxt-handler-validation@0.2.1
