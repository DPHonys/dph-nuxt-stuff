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

The module has no options. Every wrapper mirrors its vanilla counterpart, and
nothing about a route's failures is configured - it is declared, in the route.

## Declaring what a route can fail with

```ts
// server/errors/users.ts - or anywhere; the values travel, no registry exists
import { defineError, payload } from '@dphonys/nuxt-handler-errors/server'

export const userErrors = defineError({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})

export const forbidden = defineError('forbidden', {
  status: 403,
  payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
})
```

```ts
// server/api/users/[id].get.ts
import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'
import { forbidden, userErrors } from '~~/server/errors/users'

export default defineCheckedEventHandler(
  { errors: [...userErrors.pick('user-not-found'), forbidden] },
  async (event, { fail }) => {
    const userId = event.context.params?.id ?? ''
    const user = await lookup(userId)

    if (!user) return fail('user-not-found', { userId })

    return user
  }
)
```

- `defineError` is one function for one variant or many; the unit is the
  **variant as a value**, and a group is an array of those values. **Spread is
  the only composition operator**: `[...users, ...orders, forbidden]`.
- `.pick()` narrows a group and is permissive about repetition; only a tag the
  group never declared is a compile error.
- `payload<T>()` is the no-library door. Any **Standard Schema** (zod, valibot,
  anything with `~standard`) works in the same position and is read for its
  inferred output type - **this module never executes it**. Either way the
  payload must survive JSON serialization, or it is a compile error where it is
  declared.
- `fail` returns `never`, so the success type still infers from the handler body
  with no annotation, and `fail('nope')` - a tag this route did not declare - is
  a compile error.

## Handling them: `matchError`

```vue
<script setup lang="ts">
import { matchError } from '@dphonys/nuxt-handler-errors/shared'

const { data, error } = await useCheckedFetch('/api/users/:id')

matchError(
  error,
  {
    forbidden: (e) => snack(`You need ${e.requiredRole}`),
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
- Each arm receives the whole variant: `{ tag, status }` plus the payload.
- **The fallback is positional and required.** `() => {}` says "ignore" out
  loud, and is greppable.
- The matcher returns `void`. Arms handle; they do not produce.
- The reactive form is composition, not a second API:
  `watch(error, () => matchError(error, …), { immediate: true })`.

## Fetching

`useCheckedFetch`, `useLazyCheckedFetch`, `useRequestCheckedFetch`,
`useCheckedAsyncData`, `useLazyCheckedAsyncData` are auto-imported.
`$checkedFetch` is a global, like `$fetch`. `matchError` is imported from
`@dphonys/nuxt-handler-errors/shared` - it is used on the server too.

### `$checkedFetch.try` - where a function can `return`

```ts
const { data, error } = await $checkedFetch.try('/api/users/:id')

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
          throw createError({ statusCode: 410, message: `gone: ${e.resource}` })
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
  handler, a bare `catch`: there are no typed arms at all, so every marked
  variant lands here. These call sites keep working - they are typed exactly as
  vanilla types them.

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
- Setting `channelToken: ''` turns gating off entirely: nothing is attached
  and nothing is stripped.
- **The thrown error always carries the marker** - only the serialized response
  is ever stripped, so observability sees known failures identically no matter
  who called.

## Observability

`recognizeKnownError` answers the variant an error carries, or `undefined`, at
both marker depths - the route's own thrown error and a fetched carrier from a
server-to-server call. This module suppresses nothing; what reaches your tracker
is your one-line choice:

```ts
import { recognizeKnownError } from '@dphonys/nuxt-handler-errors/server'

// server/plugins/observability.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    // A route's own declared failure: expected, not a bug.
    if (recognizeKnownError(error) && error.unhandled === false) return

    report(error)
  })
})
```

The same predicate works in Sentry's `beforeSend` over
`hint.originalException`. The `unhandled === false` half is load-bearing: a
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

## License

Licensed under the [MIT License](./LICENSE).
