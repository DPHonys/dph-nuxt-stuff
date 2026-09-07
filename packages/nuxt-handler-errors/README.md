# Nuxt Handler Errors

Declare a Nitro handler's expected failures once, and get them typed at every
call site from the route path alone. `matchError` makes handling them one call
with exhaustive arms - checked failures, in the checked-exception sense.

## Installation

```sh
pnpm add @dphonys/nuxt-handler-errors
```

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors'],
})
```

The module has one option, `channelToken` - see
[Channel gating](#channel-gating). Every wrapper mirrors its vanilla
counterpart, and nothing about a route's failures is configured - it is
declared, in the route.

**Requirements:** Nuxt `>=4.5.1 <5.0.0`, Node 22.19+ / 24.11+ / 26+.

## Declaring what a route can fail with

```ts
// server/api/users/[id].get.ts
import { z } from 'zod'

const userErrors = defineError({
  'user-not-found': { status: 404, payload: z.object({ userId: z.string() }) },
  forbidden: { status: 403 },
})

export default defineCheckedEventHandler(
  { errors: [...userErrors] },
  async (event, { errors }) => {
    if (!event.context.user) throw errors.forbidden()
    const userId = event.context.params?.id ?? ''
    const user = await lookup(userId)

    if (!user) throw errors.userNotFound({ userId })

    return user
  }
)
```

- **The contract belongs to the endpoint.** `defineError` creates a single
  declaration or a reusable group. Group keys are tags; each definition has
  an HTTP error `status` (400-599) and an optional `payload` Standard Schema.
  The handler's `errors` array selects exactly what the route can raise.
- **Tags are kebab-case; factories are camelCase.** The wire carries the tag
  you declare, `'user-not-found'`, and the handler reaches its factory as
  `errors.userNotFound`. A tag is lowercase ASCII letters and digits in
  `-`-separated words, each word starting with a letter. Anything else,
  `userNotFound` included, is a compile error and a `TypeError` at
  declaration.
- The second argument receives **local factories** in `errors`. A factory with
  a schema takes its inferred input; one without `payload` takes no arguments.
  Undeclared keys are compile errors. Use `throw errors.tag(input)`, not
  `return` and not `await`: factories synchronously return errors.
- **Schemas execute at runtime**, inside the factory call, so the result is a
  finished error. Schemas must validate synchronously; an asynchronous schema
  throws a `TypeError` from the factory. Transforms become flat client
  fields, typed as the schema's output.
  Invalid factory payloads are programmer errors and answer an unmarked **500**,
  not the declared status. Schema output must be a JSON-serializable object
  without the reserved keys `tag` and `status`.
- **Successes are unchanged.** Throwing a failure leaves the normal return
  type inferred from the handler body, with no success envelope or annotation.
- Bring your own Standard Schema library (Zod above, Valibot, or another
  implementation); none is bundled. `defineCheckedEventHandler` is
  auto-imported inside `server/`, like `defineEventHandler`. Import it from
  `@dphonys/nuxt-handler-errors/server` where auto-imports do not reach.

### Singles, groups and payloads

```ts
// server/errors/users.ts
import { defineError } from '@dphonys/nuxt-handler-errors/server'
import { z } from 'zod'

export const unauthorized = defineError('unauthorized', { status: 401 })
export const userErrors = defineError({
  'not-found': { status: 404 },
  conflict: {
    status: 409,
    payload: z.object({ email: z.string().trim().toLowerCase() }),
  },
  suspended: { status: 403, payload: z.object({ until: z.string() }) },
})
```

```ts
import { unauthorized, userErrors } from '~~/server/errors/users'

export default defineCheckedEventHandler(
  { errors: [unauthorized, ...userErrors.pick('not-found', 'conflict')] },
  async (event, { errors }) => {
    if (!event.context.user) throw errors.unauthorized()
    const user = await lookup(event.context.params?.id ?? '')
    if (!user) throw errors.notFound()
    if (await taken(user.email)) throw errors.conflict({ email: user.email })
    return user
  }
)
```

Spread a whole group with `[...userErrors]`, combine it with singles using
`[...userErrors, unauthorized]`, or use `.pick()` directly as the `errors` array.
Groups and singles can be exported and reused; no global registry is needed.
A schema's output becomes flat fields, such as `e.email` or `e.until`, beside
`tag` and `status`; a definition without `payload` carries only those two.

`ErrorFactories<A>` from `@dphonys/nuxt-handler-errors/types` describes the
factory map for a declaration array `A`. For example, with
`const conflicts = userErrors.pick('conflict')`, use
`ErrorFactories<typeof conflicts>` for a helper that only needs that factory.

## Handling them: `matchError`

```vue
<script setup lang="ts">
import { matchError } from '@dphonys/nuxt-handler-errors/shared'

const { data, error } = await useCheckedFetch('/api/users/42')

matchError(
  error,
  {
    forbidden: () => snack('Sign in first'),
    'user-not-found': (e) => notFound(e.userId),
  },
  (err, unrecognized) => {
    if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
    showError(err)
  }
)
</script>
```

One call absorbs the `if (error)` and the is-it-known check.

- **The arms are exhaustive over what the route declared.** Adding a variant
  server-side breaks every call site - the compiler reporting that a new failure
  exists is the point.
- Each arm receives `{ tag, status, ...payload }`, or just `{ tag, status }`
  for a definition without a payload. Matching uses the tag, not the payload.
- **The fallback is positional and required.** `() => {}` says "ignore" out
  loud, and is greppable.
- The matcher returns `void`. Arms handle; they do not produce.
- The reactive form is composition, not a second API:
  `watch(error, () => matchError(error, …), { immediate: true })`.

## Fetching

`useCheckedFetch`, `useLazyCheckedFetch`, `useRequestCheckedFetch`,
`useCheckedAsyncData`, `useLazyCheckedAsyncData` are auto-imported, as are the
server helpers (`defineCheckedEventHandler`, `defineError`,
`recognizeKnownError`) inside `server/`. `$checkedFetch` is a global, like
`$fetch`. `matchError` is imported from `@dphonys/nuxt-handler-errors/shared` -
it is used on the server too.

### `$checkedFetch.try` - where a function can `return`

```ts
const { data, error } = await $checkedFetch.try('/api/users/42')

if (error) {
  matchError(error, {/* … */}, (err) => showError(err))
  return null
}

return data // narrowed to the route's response type
```

`$checkedFetch(…)` itself is vanilla: it throws. `.try` exists because a
`catch` variable is `unknown` and a return type is the only position that can
carry the declared union. `{ data, error }` is a discriminated union, so
`if (error) return` narrows `data` with no second guard and no `!`.

### `useCheckedAsyncData` - the repository shape

```ts
const userRepo = {
  get: (id: string) => $checkedFetch.try(`/api/users/${id}`),
}

const { data, error } = await useCheckedAsyncData('user', () =>
  userRepo.get(id)
)

matchError(error, {/* … */}, (err) => showError(err))
```

Vanilla `useAsyncData` where the handler returns `.try` results instead of
throwing - no route is ever restated, because the union rides the handler's
return type. Forgetting `.try` is a compile error. A method touching several
routes early-returns each failure, and the arms stay exhaustive across all of
them. The options are vanilla's own `AsyncDataOptions`, over the unwrapped
success.

### `event.$checkedFetch` - server to server

```ts
export default defineEventHandler(async (event) => {
  const { data, error } = await event.$checkedFetch.try('/api/chain/c')

  if (error) {
    matchError(
      error,
      {
        'c-gone': (e) => {
          throw createError({
            statusCode: 410,
            message: `gone: ${e.resource}`,
          })
        },
      },
      (err) => report(`upstream failure: ${err.status ?? 0}`)
    )

    throw createError({ statusCode: 502, message: 'upstream failed' })
  }

  return { ok: data.ok }
})
```

Same shape, with `throw` as the exit; the trailing generic throw is required
because the compiler cannot know an arm throws. The event-bound instance
forwards the request's identity (cookies, headers) the way `event.$fetch` does.

**Server-to-server is `.try` plus translation arms, always.** Letting a callee's
failure escape does not forward the variant - the framework scrubs it - but it
does leak the callee's status line as your route's answer.

## When the call site does not know the tag

The fallback's second parameter is `{ tag, status }` - the wire floor - and it
means one thing: **known to the server, not to this call site**.

- **Deploy skew.** The server runs a newer build and sends a tag this bundle
  never compiled against (a tab left open across a deploy). No type system
  catches that; the matcher routes it to the fallback rather than into an arm
  typed as something it is not.
- **A degraded call site.** Vanilla `useFetch`, a throwing `useAsyncData`
  handler, a `catch` narrowed with Nuxt's `isNuxtError`: there are no typed
  arms at all, so every marked variant lands here. These call sites keep
  working - they are typed exactly as vanilla types them.

A route that declares nothing is typed exactly as vanilla, everywhere.

## Channel gating

Responses to callers that are **not your app** go out with the known-error
marker stripped: third parties get an ordinary error response, while your own
calls - browser and SSR alike - get the full wire. This is **on by default**,
under the default channel token `'nuxt-handler-errors'`; set your own to name
your app's channel:

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors'],
  handlerErrors: {
    channelToken: 'my-app',
  },
})
```

Every fetch surface of this module (`$checkedFetch` and `.try`,
`event.$checkedFetch`, `useCheckedFetch` and its lazy twin) sends the token as
the `x-known-error-channel` request header, and a Nitro error-handler entry
strips the marker from the response body of any request that did not carry the
**matching value** - the match is always by value, never by mere header
presence.

- **The token is a channel tag, not a secret.** The browser must send it too,
  so it is compiled into the client bundle and is visible in devtools. It marks
  first-party intent; it authorises nothing, and nothing that matters may be
  gated on it.
- **The token is build-time.** It is a module option, baked into both bundles
  at build - there is no env override and no runtime config; changing it is a
  rebuild.
- Setting `channelToken: false` turns gating off entirely: nothing is attached
  and nothing is stripped. An empty string disables gating too, but warns at
  build time - only `false` can mean it on purpose, and `''` is usually an
  unset value that reached the config.
- **The thrown error always carries the marker** - only the serialized response
  is ever stripped, so observability sees known failures identically no matter
  who called.

## Observability

`recognizeKnownError` answers the variant an error carries, or `undefined`, at
both marker depths - the route's own thrown error and a fetched carrier from a
server-to-server call. This module suppresses nothing; what reaches your tracker
is your one-line choice:

```ts
// server/plugins/observability.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    // A route's own declared failure: expected, not a bug.
    if (recognizeKnownError(error) && error.unhandled === false) return

    report(error)
  })
})
```

The same read works in Sentry's `beforeSend` over `hint.originalException`
once it is narrowed with `instanceof Error` - every hook hands over an
`Error`, and that is what `recognizeKnownError` takes. The
`unhandled === false` half is load-bearing: a
declared failure that **escaped** an inner handler reaches the hook carrying a
marker too, and that one is a caller bug that must keep reporting.

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-handler-errors dev
pnpm --filter @dphonys/nuxt-handler-errors typecheck
pnpm --filter @dphonys/nuxt-handler-errors test
pnpm --filter @dphonys/nuxt-handler-errors build
pnpm --filter @dphonys/nuxt-handler-errors publint
```

The `internals/*` entries, consumed only by `@dphonys/nuxt-typed-handler`, are
documented in [`INTERNALS.md`](./INTERNALS.md).

## License

Licensed under the [MIT License](./LICENSE).
