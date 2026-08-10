# Nuxt Handler Errors

Declare a Nitro handler's expected failures once, in the route file, and recover
them at every call site from the route path alone — with the success type
untouched and vanilla `useFetch` unpolluted.

- **Nothing to annotate.** The declared union rides a phantom brand on the
  handler's _type_, never its return type.
- **Nothing to intercept.** A declared failure is an ordinary HTTP error
  carrying one reserved key. No error-handler override, no Nitro plugin.
- **Nothing breaks.** On a route that declares nothing, every wrapper is
  indistinguishable from the vanilla one it mirrors.

---

## The contract, in one page

If this page does not make the idea obvious, that is a defect in this page.

### What the endpoint author writes

A catalogue, once, in `server/` — it is server-side vocabulary, and the client
never needs it:

```ts
// server/errors/user.ts
import { defineErrors, payload } from '@dphonys/nuxt-handler-errors-old/server'

export const userErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})
```

```ts
// server/errors/auth.ts
import { defineErrors, payload } from '@dphonys/nuxt-handler-errors-old/server'

export const authErrors = defineErrors({
  unauthorized: { status: 401 },
  forbidden: {
    status: 403,
    payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
  },
  'token-expired': { status: 401, payload: payload<{ expiredAt: string }>() },
})
```

Then the route declares exactly what it can produce, and gets a `fail` scoped to
that:

```ts
// server/api/users/[id].get.ts
import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors-old/server'
import { authErrors } from '~~/server/errors/auth'
import { userErrors } from '~~/server/errors/user'

export default defineTypedEventHandler(
  { errors: [userErrors, authErrors.pick('forbidden')] },
  async (event, { fail }) => {
    const id = getRouterParam(event, 'id')!

    if (id === 'missing') return fail('user-not-found', { userId: id })
    if (id === 'suspended')
      return fail('user-suspended', { until: '2026-12-31' })
    if (id === 'private') return fail('forbidden', { requiredRole: 'owner' })

    // success type: { id: string; name: string; email: string }
    // no annotation anywhere.
    return { id, name: `User ${id}`, email: `${id}@example.com` }
  }
)
```

- The success type still infers from the body, exactly as a plain
  `defineEventHandler` does — `fail` returns `never`, so `return fail(…)`
  contributes nothing to the inferred return type.
- `fail('not-a-declared-tag')` is a compile error listing the declared tags.
- `.pick()` is about honesty: a route listing an eight-variant catalogue it can
  only produce two of has published a contract for six failures it will never
  emit.
- Nitro's own `InternalApi` entry for this route is **untouched**. Vanilla
  `useFetch('/api/users/1')` still types `data` as the success object and `error`
  as `NuxtError<unknown>`, unchanged and unpolluted.

### What the consumer gets

In a component, from the route path alone:

```ts
// inside <script setup lang="ts"> — both names are auto-imported
const { data, error } = await useTypedFetch('/api/users/private')
//      ^? Ref<{ id: string; name: string; email: string } | undefined>

const failure = useDeclaredError(error)
const current = failure.value // ← narrowing lands on a local const
//    ^? { tag: 'user-not-found', status: 404, userId: string }
//     | { tag: 'user-suspended', status: 403, until: string }
//     | { tag: 'forbidden', status: 403, requiredRole: 'admin' | 'owner' }
//     | undefined

if (current?.tag === 'user-suspended') showBlocked(current.until)
```

and imperatively, anywhere — client, server, `shared/`:

```ts
const r = await $typedFetch.safe('/api/users/123')

if (!r.ok) {
  switch (r.error.tag) {
    case 'user-not-found':
      return notFound(r.error.userId)
    case 'user-suspended':
      return blocked(r.error.until)
    case 'forbidden':
      return denied(r.error.requiredRole)
    default: {
      const _never: never = r.error
      return _never
    }
  }
}

use(r.data)
```

### The three sentences the whole design rests on

1. **The declared union never enters the handler's return type.** It rides a
   phantom brand on the handler's _type_, recovered through a generated parallel
   `.d.ts` keyed by the same route strings Nitro uses. `ReturnType` reads only
   the call signature; the brand is a sibling property. The leak is structurally
   impossible, not merely avoided.
2. **On the wire, a declared failure is an ordinary HTTP error carrying one
   reserved key.** `data.__declaredError__ = { ...payload, tag, status }`. Its
   presence _is_ the evidence the server declared this failure; its value _is_
   the variant.
3. **Graceful degradation to vanilla is a lock.** On a route that declares
   nothing, every wrapper is indistinguishable from its vanilla counterpart —
   same accepted argument types, same completions, same error channel. An
   undeclared route is never a compile error.

There is no Result type to learn: `fail` throws, so handler bodies stay linear
imperative code with early exits — nothing to combine, nothing to unwrap.

---

## Installation

```sh
pnpm add @dphonys/nuxt-handler-errors-old
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors-old'],
})
```

The module supports Nuxt `>=4.5.0 <5.0.0`. Nuxt 5 moves to h3 v2 / Nitro 3,
which this module has not been measured against; the floor is what was
measured.

The module has **zero options**: every wrapper mirrors its vanilla counterpart
exactly, so there is nothing to configure.

It also adds no dependencies and next to no bundle weight — the runtime is thin
delegation over `useFetch`/`$fetch`, with no per-call allocation beyond what
vanilla already builds.

### Migrating an existing handler

Adoption is per-route: swap `defineEventHandler` for `defineTypedEventHandler`
and convert its hand-thrown `createError` calls to declared variants, one route
at a time. Routes you have not touched keep behaving — and typing — exactly as
vanilla, because an undeclared route is indistinguishable from one that never
opted in. There is no all-or-nothing switch.

---

## Two rules the compiler will not teach you

Most of this design enforces itself at compile time. **These two do not**, and
each will otherwise be discovered the hard way.

First, though, the rule that _is_ enforced, stated once: **`fail` is the only
raise path.** It is scoped to the route's declared union, it cannot name a tag
the route did not declare, and its payload arity is checked. There is
deliberately no unenforced escape hatch for throwing a declared failure from
helper code — a helper returns evidence, and the route converts it under
`fail`'s enforcement:

```ts
// server/utils/check-owner.ts
export function checkOwner(user: User, actor: Actor) {
  return isOwner(user, actor)
    ? ({ ok: true } as const)
    : ({ ok: false, required: 'owner' as const } as const)
}

// in the route
const check = checkOwner(user, actor)
if (!check.ok) return fail('forbidden', { requiredRole: check.required })
```

That one line of ceremony is what keeps every wire failure traceable to a
declaration the client can see.

### 1. `.safe` returns what the route declared. Everything else throws

```ts
const user = await $typedFetch('/api/users/123') // throws, as $fetch does
const r = await $typedFetch.safe('/api/users/123') // returns the declared union
```

`ok: false` means one thing only: _a declared failure the route promised_. A 500,
a timeout, a network drop, and a route that declares nothing all leave through
`throw`, exactly as they do through vanilla `$fetch`. The default entry point is
not unsafe — it is just vanilla, and it is what
`useAsyncData(() => $typedFetch('/api/users/1'))` composes with. `.safe` adds a
branch and removes nothing, including the `catch` vanilla already required.

### 2. Overriding `accept` forfeits the declared-error channel

Every request this module makes carries `accept: application/json`. Without it,
Nitro's `isJsonRequest` heuristic can decide to render an error as an HTML page
instead — it falls back to `event.path.startsWith('/api/')`, which fails for
every route outside `/api/**` and for every route under a non-root
`app.baseURL`.

A caller's explicit `accept` is honoured deliberately, on every surface:

```ts
// this is respected — and it forfeits the declared channel on /status
await $typedFetch('/status', { headers: { accept: 'text/html' } })
```

Lose the header on such a route and a declared 403 arrives as an HTML string in
`err.data`: no marker, `declaredError()` answers `undefined`, `.safe` never
takes its `ok: false` arm. Routes under `/api/**` are unaffected.

---

## Declaring failures

### `defineErrors` and `payload`

```ts
export const userErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})
```

- **Status is inline and has no default** — a defaulted 400 would quietly turn
  404/409/403 into 400s. `status` is typed as the common 4xx/5xx literals
  unioned with `(number & {})`, so it gets completions without closing the set.
- **Literal types survive.** A status written as `404` stays `404` all the way to
  the client, and `payload<{ requiredRole: 'admin' | 'owner' }>()` round-trips
  its union intact.
- **`payload<T>()` rejects fields that do not survive JSON serialization**, as a
  missing-property error naming the field. A `bigint` would not merely vanish
  from the client's type — it makes `JSON.stringify` **throw** inside Nitro's
  serializer, converting a declared 403 into a genuine unhandled 500. `unknown`
  and `void` map to `never` silently. `Date` → `string` is fine.
- **Composition is a homogeneous array**:
  `errors: [authErrors.pick('forbidden'), userErrors]`.
- **Duplicate tags across composed catalogues are a compile error** naming the
  colliding tag. Two catalogues declaring an _identical_ member are correctly
  not flagged — only a genuine divergence in status or payload trips it.
- **Catalogues are server-side**, and `server/errors/` is the documented
  default. The module never looks at where one lives, but `/server` reaches
  `h3`, so a catalogue cannot sit in a consumer's `shared/` directory — that
  directory compiles into the client program too. Nothing is lost by this: a
  route's declared union reaches the client through the generated map, keyed by
  route path, so the catalogue value itself has no client-side role at either
  the value or the type level.
- **An array-valued payload field must be a NAMED interface**, not an inline
  object literal. Nitro's `Simplify` short-circuits on arrays, so naming the
  element type is what keeps the consumer's hover short
  (`SerializeObject<Issue>[]`) instead of an expanded literal. The type is
  structurally exact either way; only the hover differs.

### `defineTypedEventHandler`

Options object first, handler last, so the declaration sits visibly at the top of
the route file:

```ts
defineTypedEventHandler(
  { errors: [userErrors, authErrors.pick('forbidden')] },
  async (event, { fail }) => {
    /* … */
  }
)
```

**Do not supply an explicit type argument.** `Response` is declared with no
default, so any explicit type argument is a `TS2558` arity error rather than a
silent collapse of the success type to `any`.

The returned handler is an ordinary h3 `EventHandler` with one optional phantom
property added, so Nitro, the router and every h3 utility keep treating the route
as ordinary.

### Input validation is not this module's job

An earlier iteration shipped `body`/`query`/`params` Standard Schema validation
on the same options object; it was cut as a second product with its own caveat
surface. Validate in the handler body and `fail` with your own variant.

---

## Reading a declared failure

**No call site ever writes the wire key.** The reader pair is the only read
path. The honest address is `err.data.data.__declaredError__` — typed by hand
at every call site, it would quietly convert a renameable protocol detail into
a breaking change for every consumer.

```ts
import { declaredError } from '@dphonys/nuxt-handler-errors-old/shared'

const failure = declaredError(error)
if (failure) {
  switch (failure.tag) {
    /* … */
  }
}
```

```ts
// the reactive sibling, for templates
const { error } = await useFetch('/api/users/42')
const failure = useDeclaredError(error)
const current = failure.value // ← narrowing lands here
if (current) {
  switch (current.tag) {
    /* … */
  }
}
```

Three consequences worth stating:

1. **Narrowing lands on a local `const`** — the only thing that survives
   `.value` reads and template weakness.
2. **Declared and undeclared are separate channels by _presence_, not by
   union.** `error` is exactly vanilla's channel; the reader returning
   `undefined` _is_ "not a declared failure". No caller pays a narrowing tax to
   reach `.status` on a 500.
3. **Both readers have a degraded second overload.** Handed something whose
   type never carried a union — a vanilla `useFetch`'s `NuxtError<unknown>`, or
   an `unknown` in a `catch` — they return `{ tag: string, status: number }
| undefined`, the shape floor the wire guarantees.

The marker's _presence_ is not enough on its own: the floor is checked too, so a
marker that is present but malformed reads as **undeclared** rather than as a
malformed declared failure.

Nothing here interacts with error boundaries: the wrappers never throw on their
own and never call `showError`, so `<NuxtErrorBoundary>` behaves exactly as it
does with vanilla `useFetch`.

---

## Fetching

### `useTypedFetch` / `useLazyTypedFetch`

A full five-overload mirror of vanilla `useFetch` that adds typings only.

```ts
// inside <script setup lang="ts">
const { data, error } = await useTypedFetch('/api/users/private')
const failure = useDeclaredError(error)
```

- **`error` keeps holding a `NuxtError`.** Nuxt's `useAsyncData`
  unconditionally runs `asyncData.error.value = createError(error)`, so a bare
  tagged union there would type-check while lying. The honest declaration is
  the envelope, `NuxtError<DeclaredErrorBody<Declared>>`, and the reader is
  what moves your attention onto the flat union.
- **Every vanilla option carries over verbatim** — `transform`, `pick`,
  `default`, `lazy`, `watch`, `immediate` — and none can interact with the
  error typing, which is computed from the request and method alone.
- **`useLazyTypedFetch` is the same interface** with `lazy: true` supplied at
  runtime, exactly as vanilla does it.

**These two names have no hand-writable published specifier, and that is
forced.** They call `useFetch`, which lives behind `#app` — an alias that
exists in the app build only, and that none of this package's three specifiers
may carry. The auto-import **is** the whole contract for these two names; a
call site that wants the import written out reaches for Nuxt's own `#imports`:

```ts
import { useTypedFetch } from '#imports'
```

**There is no `useAsyncData` counterpart**, and there will not be one:
`useAsyncData(key, handler)` takes a _function_, not a route literal, so there
is no path for the map to be keyed by. Both routes to typed errors already
exist with no new API:

```ts
// compose with the throwing form — hoist the loader, see below
const loadUser = () => $typedFetch('/api/users/1')
const { data, error } = useAsyncData(loadUser)
```

```ts
// or name the type explicitly
import type {
  DeclaredErrorBody,
  DeclaredErrorsOf,
} from '@dphonys/nuxt-handler-errors-old/types'

const { error } = useAsyncData<
  User,
  DeclaredErrorBody<DeclaredErrorsOf<'/api/users/:id', 'get'>>
>('user', () => fetchUser())
```

> **Hoist the loader out of the `useAsyncData` call.** Written inline —
> `useAsyncData(() => $typedFetch('/api/users/1'))` — the arrow's return is
> contextually typed by `useAsyncData`'s own unresolved type parameter, which
> produces `TS2321 Excessive stack depth`, one per route in the app. **This is
> not this module's:** the vanilla spelling with `$fetch` produces the
> identical diagnostics on the identical line. Hoisting removes the contextual
> type, and both spellings are then clean. It is the same rule as
> [Depth, and one practical rule](#depth-and-one-practical-rule).

### `$typedFetch` and `$typedFetch.safe`

A genuine global, declared the way Nitro declares `$fetch` — **no import, and not
an auto-import either**. It works verbatim in a `<script setup>` block, in a Nitro
route file, and in a consumer's `shared/` module.

```ts
const user = await $typedFetch('/api/users/123') // throws, as $fetch does
const r = await $typedFetch.safe('/api/users/123') // returns the declared union
```

`.safe`'s result is a two-arm discriminated union on `ok`, and `error` is the
**flat variant** — the wrapper has already run the reader internally. On an
undeclared route or an external URL the result collapses to one arm, so `ok`
narrows to the literal `true` and `data` is reachable with no branch at all:

```ts
const undeclared = await $typedFetch.safe('/api/boom')
// ^? { ok: true, data: … }   — no false arm exists
```

The namespace mirrors vanilla's exactly: `raw` and `create`, and neither grows
its own `.safe`. `create` returns the _typed_ interface, so `.safe` survives on
created instances. `raw` is a passthrough in every respect but one — it still
runs this module's header merge, because its caller is still entitled to read
the marker.

### `event.$typedFetch` — server to server

Inside a Nitro handler, `event.$typedFetch` is the same surface bound to the
incoming request. It is `event.$fetch` plus `.safe` and nothing else — no `raw`,
no `create` — because that is exactly what `event.$fetch` is.

```ts
// server/api/chain/b.get.ts
import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors-old/server'
import { chainErrors } from '~~/server/errors/chain'

export default defineTypedEventHandler(
  { errors: [chainErrors.pick('b-upstream')] },
  async (event, { fail }): Promise<{ hop: 'b'; from: 'c'; cookie: string }> => {
    const result = await event.$typedFetch.safe('/api/chain/c')

    if (!result.ok) {
      // one `case` and no `default`: C declares exactly one variant, so a
      // union that had degraded would leave this switch non-exhaustive
      switch (result.error.tag) {
        case 'c-gone':
          return fail('b-upstream', {
            from: result.error.resource,
            cookie: result.error.cookie,
          })
      }
    }

    return { hop: 'b', from: result.data.hop, cookie: result.data.cookie }
  }
)
```

**What is forwarded, precisely.** The incoming request's **headers and cookies**,
the caller's **platform bindings** (`event.context._platform`), and its
**`waitUntil`**. That is all — an arbitrary key you set on `event.context` does
**not** reach the callee:

```ts
event.context._platform = { probeToken: 'x' } // → callee: context.probeToken
event.context.probeToken = 'x' // → callee: absent
```

**Two behaviours a caller must know.**

- Overriding `accept` forfeits the declared channel for callees outside
  `/api/**`, exactly as it does on the global surface.
- **Prefer `.safe` server-to-server.** An `ok: false` you ignore is a
  compile-visible omission; an escaped throw is not — and an escaped callee throw
  costs something specific. See
  [an escaped callee throw leaks the callee's tag](#an-escaped-callee-throw-leaks-the-callees-tag).

**The module ships no propagation mechanism, and none is needed.** A caller
writes `if (!r.ok) return fail(…)`. To forward a callee's variant _verbatim_, it
imports the same catalogue and declares it in its own `errors: [...]` — which
already works, and which makes leaking an internal contract to the client
unrepresentable as an accident: `fail('c-gone')` is a compile error unless the
tag is in the caller's own list.

> **A route's declared union is exactly what it wrote in `errors: [...]`. Where a
> variant is _produced_ — in the handler body, in a helper, or forwarded from a
> callee — is invisible to the client and is not a design question.**

---

## Specifiers, and what is auto-imported

Each specifier answers "who is this for", and each carries exactly the
dependency that question implies. The bare `.` is import-protected by Nuxt in
every context including `shared/`, so it is never hand-written:

| Specifier                                 | Holds                                                                                       | Reaches   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| `@dphonys/nuxt-handler-errors-old`        | the Nuxt module itself, for `nuxt.config.ts`                                                | —         |
| `@dphonys/nuxt-handler-errors-old/server` | the declaration surface, for route files and `server/`                                      | `h3`      |
| `@dphonys/nuxt-handler-errors-old/shared` | genuinely side-agnostic values — client, server and your `shared/` folder alike             | nothing   |
| `@dphonys/nuxt-handler-errors-old/types`  | the public type surface, and the build-time augmentation target for the generated error map | type-only |

`/server` carries `defineErrors`, `payload` and `defineTypedEventHandler`. It is
server-only because `defineTypedEventHandler` calls h3's `defineEventHandler`,
and importing it from a `shared/` file would pull `h3` into your client bundle.

`/shared` carries `declaredError` and `DECLARED_ERROR_KEY`. "Side-agnostic" here
is a claim about the import graph, not a label: nothing reachable from it
imports `vue`, `h3` or `#app`.

`/types` carries `DeclaredErrorsOf`, `TypedApiErrors`, `AnyVariant`,
`DeclaredErrorBody`, `TypedResult`, `ErrorCatalogue`, `VariantsOf`, `Fail`,
`TypedEventHandler`, `Flatten`, `$TypedFetch`, `Event$TypedFetch` and
`ExtractErrorsSafe`. That is the list of names you have reason to _write_ — the
guards, the payload machinery and the hover-shortening `Define*` interfaces are
internal and deliberately unpublished.

**Auto-imports are additive sugar, except app-side, where they are the whole
contract.** Nothing in `app/` can sit on a published specifier — `useTypedFetch`
imports `#app`, and a `/app` entry point holding `useDeclaredError` alone would
never gain the siblings it belongs beside:

| Name                                                     | How it is reached                                             |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `useTypedFetch`, `useLazyTypedFetch`, `useDeclaredError` | auto-import **is** the contract; `#imports` to write them out |
| `declaredError`                                          | `/shared`, hand-written — not auto-imported                   |
| `$typedFetch`                                            | a real `globalThis` property, on both sides                   |
| `event.$typedFetch`                                      | on the event, server-side only                                |

`declaredError` is deliberately absent from the auto-imports: its callers are
the server and your `shared/` directory, where app-side auto-imports do not
reach anyway, and in a component `$typedFetch.safe` already hands back the flat
variant while `useTypedFetch` pairs with the reactive reader.

`DeclaredErrorsOf` is worth naming explicitly, because remapping a callee's
failure is the blessed server-to-server shape:

```ts
import type { DeclaredErrorsOf } from '@dphonys/nuxt-handler-errors-old/types'

function toOrderFailure(e: DeclaredErrorsOf<'/api/users/:id'>): OrderTag {
  switch (e.tag) {
    /* … */
  }
}
```

---

## Depth, and one practical rule

Nitro's own `AvailableRouterMethod` recurses per character through
route-matching score conditionals, and meeting it with an unresolved generic
can produce `TS2321 Excessive stack depth`. This predates the module — vanilla
`useFetch`'s signature contains the same expression, excused by `skipLibCheck`
because it ships in a `.d.ts`.

Every occurrence measured during implementation had a one-line fix. Two of them
are yours to know:

> **Let a typed fetch's result infer. Assert its shape somewhere other than on
> the call.**

```ts
// ✗ a variable annotation keeps the request type unresolved
const forwarded: Echo = await event.$typedFetch('/api/context-echo')

// ✗ so does a contextual return type — this is why the useAsyncData
//   composition above hoists its loader
useAsyncData(() => $typedFetch('/api/users/1'))

// ✓ let it infer, and claim the shape from the argument position instead
const forwarded = await event.$typedFetch('/api/context-echo')
useEcho(forwarded)
```

> **A handler whose return type is _inferred_ from a fetch call needs an explicit
> return annotation.**

```ts
;async (event, { fail }): Promise<{ hop: 'b'; from: string }> => {
  /* … */
}
```

That one is not this module's — it is the cycle Nitro already has: the handler
needs the route interface to type the call, and needs the call to type its own
entry in that interface. An explicit annotation cuts the edge.

---

## The wire format

Specified so an **unrelated client — in any language — can consume it**. Nothing
intercepts this: no Nitro plugin, no error-handler override, just one
`createError` call at the raise site.

`HTTP/1.1 403 forbidden`, with this body — reserved keys last, exactly as the
raise site spreads them:

```json
{
  "error": true,
  "url": "http://localhost:3000/api/users/9",
  "statusCode": 403,
  "statusMessage": "forbidden",
  "message": "forbidden",
  "data": {
    "__declaredError__": {
      "requiredRole": "owner",
      "tag": "forbidden",
      "status": 403
    }
  }
}
```

### What a non-JavaScript client needs to know

1. Read the response body as JSON. If `body.data.__declaredError__` is absent,
   this is **not** a declared failure — treat it as any ordinary HTTP error.
2. If present, it must be an object with a string `tag` and a number `status`. If
   not, treat it as undeclared. That floor is the whole guarantee; payload keys
   are unconstrained.
3. **That object _is_ the variant.** `tag` is the discriminant, `status` is the
   declared HTTP status, and every other key is payload defined by the endpoint.
4. `message` and `statusMessage` are redundant copies of `tag`. **Do not render
   them to users** — human copy is the client's job, keyed off the tag.
5. A tag you do not recognise is a **declared failure you do not recognise**, not
   a framework error. That distinction is exactly what the marker exists to give
   you.

`status` inside the marker is authoritative; the HTTP status line is best-effort.
h3 rewrites anything outside 100–999 to a default, so a bogus catalogue status
yields a 500 on the wire while the marker still says what was declared.

**Versioning is by key rename.** A future incompatible envelope uses a new key;
an old client sees no marker it recognises and falls back to the undeclared
channel — the conservative direction, with no version-negotiation policy to
write. The key deliberately does **not** track the package name, so the package
can be renamed without desynchronising a deployed server from a deployed
client. Import it as `DECLARED_ERROR_KEY` from `/shared` rather than writing
the literal.

---

## Limitations

Every item here is a known, measured gap. Inheriting a silent one is worse than
inheriting a stated one.

### Deploy skew: an unrecognised tag is typed as a member it is not

A server one deploy ahead sends `{ tag: 'quota-exceeded', status: 429,
retryAfter: 60 }`. At runtime the marker is present and the floor holds, so a
reader can honestly say _"a declared failure I do not recognise"_. **The typed
channel cannot surface it**, because the only shape that could — widening the
union with `{ tag: string & {}, status: number }` — was measured to destroy
narrowing for the _whole_ union, in every branch.

> Under deploy skew, a tag the client does not know comes back **typed as a
> member it is not**, and reaches whatever fallback the caller wrote.
> `const _never: never = failure` stays compile-valid while being
> runtime-reachable.

This is the standard closed-union-over-the-wire tail. It is stated plainly rather
than priced into every call site.

### An escaped callee throw leaks the callee's tag

If a handler uses the _throwing_ `$typedFetch` server-to-server and does not
catch, the callee's `FetchError` escapes. h3 marks any non-`H3Error` throw as
`unhandled`, and Nitro's production serializer then treats it as sensitive:

| Field           | Fate                                                   |
| --------------- | ------------------------------------------------------ |
| status          | preserved                                              |
| `data`          | **wiped entirely** — the envelope cannot leak this way |
| `message`       | masked to `"Server Error"`                             |
| `statusMessage` | **not gated** — and it carries the callee's tag        |

So the envelope is safe and **the callee's internal tag reaches the caller's
client as the HTTP reason phrase.** The declared failure degrades to undeclared,
which is the safe direction, for free.

The module does nothing about this, deliberately: it is byte-for-byte what plain
`$fetch` between handlers does today. Normalising the throw or converting it to an
honest 500 were both considered and both break the typings-only lock. **What ships
is this paragraph plus one line of guidance: prefer `.safe()` server-to-server.**

Note also that an escaped callee failure _is_ `unhandled`, so unlike a declared
failure handled normally it is logged as `[request error] [unhandled]`, fires
`captureError`, and escalates to the global error page. That is correct behaviour
for a genuine caller bug.

### An undeclared route is silent

A route that never opted in infers `never`, which is the honest statement — _"this
route declares no failures"_, not _"this route cannot fail"_. It is deliberately
not a compile error, because that is what the degradation lock requires. You get
no signal at all.

### Declared failures fire Nitro's `captureError`

Error-page escalation is already correct — Nuxt escalates only on
`fatal || unhandled`, and a declared failure is neither — but Nitro's
`captureError` fires the `error` hook unconditionally, so Sentry-style
integrations see every declared failure as an error.

### `ExtractErrorsSafe` called directly on an index signature answers `unknown`

Everything reachable _through the generated map_ is closed; only a direct
hand-written `ExtractErrorsSafe<T>` call on a type carrying `[k: string]:
unknown` answers `unknown`, and such a call site guards it itself.

### One generated map entry is uninhabited

Nuxt registers its island renderer under an alias the path resolver does not
resolve, so `DeclaredErrorsOf<'/__nuxt_island/foo'>` answers `any` rather than
`never`. The route is Nuxt-internal and the state is pinned by a test.

### The gate's compiler is the consumer's compiler

The repo type-checks and runs every type fixture on stock TypeScript 5 — the
same compiler every downstream project runs over the emitted `.d.ts` — and the
workspace `typescript` caret floats deliberately, so a new stock minor breaking
the suites is a consumer-divergence signal delivered as a red Renovate PR.

---

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-handler-errors-old dev
pnpm --filter @dphonys/nuxt-handler-errors-old typecheck
pnpm --filter @dphonys/nuxt-handler-errors-old test
pnpm --filter @dphonys/nuxt-handler-errors-old build
pnpm --filter @dphonys/nuxt-handler-errors-old publint

# ungated diagnostic: dev-server map convergence, for when a Nuxt/Nitro bump
# is suspected
pnpm --filter @dphonys/nuxt-handler-errors-old dev-race
```

`dev` builds the module for real before starting the playground. Two of the three
specifiers point inside `dist/runtime/`, and `nuxt-module-build --stub` replaces
that directory with a symlink to source, which breaks them — so `--stub` is
unusable here and no task may rely on it.

## License

Licensed under the [MIT License](./LICENSE).
