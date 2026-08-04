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

The full design, its evidence and its rejected alternatives are in
[`SPEC.md`](./SPEC.md). This README is the usage guide, and it documents what
actually ships.

---

## The contract, in one page

If this page does not make the idea obvious, that is a defect in this page.

### What the endpoint author writes

A catalogue, once, anywhere — `shared/` is the documented default:

```ts
// shared/errors/user.ts
import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/shared'

export const userErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})
```

```ts
// shared/errors/auth.ts
import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/shared'

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
import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/shared'
import { authErrors } from '#shared/errors/auth'
import { userErrors } from '#shared/errors/user'

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
- `.pick()` is about honesty, not convenience: a route listing an eight-variant
  catalogue it can only produce two of has published a contract for six failures
  it will never emit.
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

---

## Installation

```sh
pnpm add @dphonys/nuxt-handler-errors
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors'],
})
```

The module supports Nuxt `>=4.5.0 <5.0.0`. The ceiling is deliberate and it is
the load-bearing half: Nuxt 5 moves to h3 v2 / Nitro 3, which this module has not
been measured against. The floor is what _was_ measured — 4.5.1 — rather than
what the scaffold assumed.

One option exists, and most apps never need it:

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors'],
  handlerErrors: {
    // 'presence' (default) | 'expanded'
    methodKeys: 'presence',
  },
})
```

`expanded` is a documented escape hatch for the day a large app's compiler tips
over on type-instantiation depth: it moves the method fallback into the emitted
map so consumption is a bare index with zero conditionals, at the cost of a
nine-fold expansion of every catch-all route. Before reaching for it, read
[Depth, and one practical rule](#depth-and-one-practical-rule) — every occurrence
measured so far had a one-line fix that was not this option.

---

## Four rules the compiler will not teach you

Most of this design enforces itself at compile time. **These four do not**, and
each will otherwise be discovered the hard way.

### 1. The handler body is enforced. Helper modules are on you

`fail` is scoped to the route's declared union and is the spelling to reach for.
It is available on every handler, it cannot name a tag the route did not declare,
and its payload arity is checked.

Sometimes the throw has to happen three frames below the handler, where `fail` is
not in scope. For that — **and only for that** — a catalogue also carries
`.raise()`:

```ts
// server/utils/assert-owner.ts
import { authErrors } from '#shared/errors/auth'

export function assertOwner(user: User, actor: Actor): void {
  if (!isOwner(user, actor))
    throw authErrors.raise('forbidden', { requiredRole: 'owner' })
}
```

> **`.raise()` is unenforced, and that is its whole cost.** Nothing checks that
> the route calling this helper declared `forbidden`. A helper can throw a
> variant the route never published, and the client is then typed a lie **with no
> compile signal at all**. Prefer `fail`. Reach for `.raise()` when the call
> stack genuinely forces it, and keep the helper close to the routes that
> declare its tags.

Whether this deserves a backstop is [an open question](#open-questions).

### 2. `.safe` returns what the route declared. Everything else throws

```ts
const user = await $typedFetch('/api/users/123') // throws, as $fetch does
const r = await $typedFetch.safe('/api/users/123') // returns the declared union
```

`ok: false` means one thing only: _a declared failure the route promised_. A 500,
a timeout, a network drop, and a route that declares nothing all leave through
`throw`, exactly as they do through vanilla `$fetch`.

**The name implies the default is unsafe. It is not — it is just vanilla.** A
fully defensive call site writes both a branch and a `catch`, but that `catch` is
the one vanilla `$fetch` already required. `.safe` adds a branch and removes
nothing.

The throwing form is not a legacy path. It is what
`useAsyncData(() => $typedFetch('/api/users/1'))` composes with, and it is why
`declaredError` exists as a value reader at all.

### 3. Overriding `accept` forfeits the declared-error channel

Every request this module makes carries `accept: application/json`, and that is
not cosmetic. Nitro's `isJsonRequest` heuristic decides whether an error comes
back as JSON or as a rendered HTML error page. Without the header the decision
falls to `event.path.startsWith('/api/')` — which fails for **every route outside
`/api/**`**, and for **every route under a non-root `app.baseURL`** (ofetch
prefixes it, so `/shop/api/x` fails the test).

A caller's explicit `accept` is honoured deliberately, on every surface:

```ts
// this is respected — and it forfeits the declared channel on /status
await $typedFetch('/status', { headers: { accept: 'text/html' } })
```

Lose the header on such a route and a declared 403 arrives as an HTML string in
`err.data`. The marker is not there, `declaredError()` answers `undefined`, and
`.safe` never takes its `ok: false` arm. Routes under `/api/**` are unaffected.

### 4. Validation runs before your handler body — including before your auth check

Input is delivered eagerly and flat, which means a malformed request is answered
_before_ a line of your handler executes:

```ts
export default defineTypedEventHandler(
  { errors: [invalidInput, authErrors.pick('unauthorized')], body: CreateUser },
  async (event, { fail, body }) => {
    // ← too late: a malformed body was already answered with 400 and field names
    if (!session(event)) return fail('unauthorized')
    return db.users.create(body)
  }
)
```

**A malformed request from an unauthenticated caller has field names disclosed to
it.** The answer is auth in **Nitro middleware**, which runs before the handler:

```ts
// server/middleware/require-session.ts
export default defineEventHandler((event) => {
  if (event.path.startsWith('/api/private') && !session(event))
    throw createError({ statusCode: 401 })
})
```

This is documented rather than solved. Lazy accessors (`await input.body()`)
would let the author order auth first, but they cost the guarantee: a handler
that never calls the accessor publishes a failure it can never emit.

---

## Declaring failures

### `defineErrors` and `payload`

```ts
export const userErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})
```

- **Status is inline and has no default.** A defaulted 400 makes a variant's
  status invisible where it is declared and quietly turns 404/409/403 into 400s.
  `{ status: 401 }` is twelve characters. `status` is typed as the common
  4xx/5xx literals unioned with `(number & {})`, so it gets completions and reads
  wrong when it is wrong, without closing the set.
- **Literal types survive.** A status written as `404` stays `404` all the way to
  the client, and `payload<{ requiredRole: 'admin' | 'owner' }>()` round-trips
  its union intact.
- **`payload<T>()` rejects fields that do not survive JSON serialization**, as a
  missing-property error naming the field. This is a hard requirement, not
  hygiene: a `bigint` does not merely vanish from the client's type, it makes
  `JSON.stringify` **throw** inside Nitro's serializer, converting a declared 403
  into a genuine unhandled 500. `unknown` and `void` map to `never` silently.
  `Date` → `string` is fine and is not rejected.
- **Composition is a homogeneous array**:
  `errors: [authErrors.pick('forbidden'), userErrors]`.
- **Duplicate tags across composed catalogues are a compile error**, and the
  message names the colliding tag. Two catalogues declaring an _identical_ member
  are correctly not flagged — only a genuine divergence in status or payload
  trips it.
- **Catalogues are location-agnostic.** The module never looks at where a
  catalogue lives, because the union travels via the brand. `shared/` is the
  documented default for one reason: a `server/`-only catalogue is unreachable
  from client code, so any later client-side _runtime_ use of the value needs a
  file move touching every import — while a `shared/` catalogue imported only by
  server code is tree-shaken out of the client bundle entirely.

### `defineTypedEventHandler`

Options object first, handler last, so the declaration sits visibly at the top of
the route file:

```ts
defineTypedEventHandler(
  {
    errors: [userErrors, authErrors.pick('forbidden')],
    body: CreateUser, // optional — any Standard Schema
    query: Paging, // optional
    params: RouteParams, // optional
  },
  async (event, { fail, body, query, params }) => {
    /* … */
  }
)
```

**Do not supply an explicit type argument.** `Response` is declared with no
default, so any explicit type argument is a `TS2558` arity error rather than a
silent collapse of the success type to `any`. The exact number in that message is
`Expected 2-6 type arguments` today and will move again the day a fourth typed
option lands — quote it from
`test/types/declare-and-raise.test.ts`, never from prose.

The returned handler is an ordinary h3 `EventHandler` with one optional phantom
property added, so Nitro, the router and every h3 utility keep treating the route
as ordinary.

---

## Validation

Schemas ride the **same options object** as `errors` — no signature change, no
third positional parameter. Any [Standard Schema](https://standardschema.dev)
validator works untouched: zod, valibot, arktype.

```ts
// server/api/signup.post.ts
import {
  defineTypedEventHandler,
  invalidInput,
} from '@dphonys/nuxt-handler-errors/shared'
import { z } from 'zod'
import { authErrors } from '#shared/errors/auth'

const CreateUser = z.object({
  name: z.string().min(1),
  'contact.email': z.email(),
  tags: z.array(z.object({ label: z.string() })).optional(),
})

const Invite = z.object({ code: z.coerce.number() })

export default defineTypedEventHandler(
  {
    errors: [invalidInput, authErrors.pick('unauthorized')],
    body: CreateUser,
    query: Invite,
  },
  async (_event, { fail, body, query }) => {
    //                      ^ CreateUser's output   ^ Invite's output
    //                        both already parsed
    if (query.code === 0) return fail('unauthorized')

    return {
      name: body.name,
      email: body['contact.email'],
      tagCount: body.tags?.length ?? 0,
      code: query.code,
    }
  }
)
```

The module ships **one plain catalogue value**, `invalidInput`, tag
`'invalid-input'`, status 400. It is an ordinary `defineErrors` product: it
composes, it is subject to the duplicate-tag guard, it has `.pick()` (vacuously)
and `.raise()`.

```ts
interface InvalidInput {
  tag: 'invalid-input'
  status: 400
  issues: ValidationIssue[]
}

interface ValidationIssue {
  location: 'body' | 'query' | 'params'
  path: (string | number)[]
  message: string
}
```

### Things worth knowing

- **`body: CreateUser` — the raw schema object.** h3's own JSDoc recommends
  `body: CreateUser.safeParse`, a spelling that _silently disables validation_
  there. Here it is a compile error (a function has no `~standard`), and the raw
  schema object h3 crashes on is the correct argument.
- **One merged variant, not one per location.** `location` sits on the _issue_,
  so one response reports everything wrong at once — a bad `body` and a bad
  `query` together.
- **`path` is a segment array, not a dotted string.** Lossless, and it survives
  serialization unchanged. The dotted form is one `.join('.')` at the call site:

  ```ts
  const label = issue.path.join('.')
  ```

  A key that itself contains `.` — like `contact.email` above — is why the dotted
  form cannot be the wire shape: `"contact.email"` could not be told apart from a
  nested `contact` object.

- **A whole-value issue is `path: []`.**
- **The status is genuinely swappable.** An app standardising on 422 declares its
  own catalogue with the same tag and lists that instead; the tag is resolved
  against the route's composed catalogues at run time.
- **Opting out is free.** Declare `body:` and simply do not list `invalidInput`:
  validation still runs and still 400s, but throws **unmarked**, landing in the
  ordinary Nuxt channel. The published union then matches `errors:` exactly.
- **`headers` is not a location, deliberately.** h3 offers no analogue, header
  contracts are a middleware/gateway concern, and every header value is a string.
  `location` is a closed union, so adding a member later would widen a published
  payload.
- **No adapter ships for pre-Standard-Schema validators** (yup, joi, superstruct,
  zod &lt; 3.24). A plain `(v: unknown) => T` escape hatch is deliberately
  rejected — accepting one reopens the `safeParse` hole verbatim, since a
  `safeParse` reference is exactly that shape. Wrap your validator yourself:

  ```ts
  import type { StandardSchemaV1 } from '@dphonys/nuxt-handler-errors/types'

  interface NewUser {
    name: string
  }

  // the annotation is load-bearing — see below
  const CreateUser: StandardSchemaV1<unknown, NewUser> = {
    '~standard': {
      version: 1,
      vendor: 'my-legacy-validator',
      validate: (value) => {
        const result = legacy.check(value)
        return result.ok
          ? { value: result.value as NewUser }
          : { issues: result.errors.map((e) => ({ message: e.message })) }
      },
    },
  }
  ```

  **Annotate the const.** A Standard Schema parks its input and output types on
  an _optional_ `~standard.types` property that carries no runtime value, so a
  bare object literal satisfies the interface with that property absent — and
  `body` then arrives as `unknown`, **with no compile signal at all**. The
  `StandardSchemaV1<Input, Output>` annotation is what supplies it. Real
  libraries do this for you; a hand-rolled wrapper must do it itself.

### Two behaviours the spec did not describe, and both ship

- **A source that cannot be _read_ becomes an issue at that location, not a
  throw.** A body that is not JSON at all yields
  `{ location: 'body', path: [], message: 'The request body could not be read.' }`.
  Without this, a body of the wrong _shape_ would be a **declared** failure while
  a body that is not JSON would be an **undeclared** one — the same caller mistake
  reported through two different channels.

  **Its cost, stated rather than hidden: it masks h3's own 405.** `readBody` on a
  method h3 refuses a body for throws `405 Method Not Allowed`, and through this
  arm the caller sees this module's 400 instead. That case is a _route author's_
  mistake — declaring `body` on a route that cannot have one — which is why the
  trade goes this way.

- **The unmarked opt-out throw still carries `issues` on `data`.** A route that
  declared a schema and did not list `invalidInput` throws unmarked, but the
  normalised issues are kept at `err.data.data.issues`, one hop shallower than the
  marker. It is deliberately **not** the marker: `declaredError` answers
  `undefined` for it, because the route never declared it.

### A rule that binds every future payload

**An array-valued payload field must be a NAMED interface**, not an inline object
literal. This inverts the usual preference, and it is about the hover a consumer
reads: Nitro's `Simplify` short-circuits on arrays, so a payload array keeps its
serialization residue in the hover and never expands. Naming the element type
renders `SerializeObject<ValidationIssue>[]` — 54 characters with a clickable
name. The identical fields written inline render 125 characters of expanded
noise inside the _same_ unevaluated wrapper. The type is structurally exact
either way; only the hover differs. This is why `ValidationIssue` is an
interface, and it binds every payload with an array field, not only this one.

---

## Reading a declared failure

**No call site ever writes the wire key.** The reader pair is the only read path.
The honest address is `err.data.data.__declaredError__` — three property hops, two
optional, ending on a key that is frozen wire protocol. Left raw, that address
gets typed by hand at every call site, which quietly converts a renameable
protocol detail into a breaking change for every consumer.

```ts
import { declaredError } from '@dphonys/nuxt-handler-errors/shared'

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

1. **Narrowing lands on a local `const`.** This is the only thing that survives
   `.value` reads and template weakness; a `NuxtError`-shaped read cannot narrow
   across `.value` boundaries reliably.
2. **Declared and undeclared are separate channels by _presence_, not by union.**
   `error` is exactly vanilla's channel; the reader returning `undefined` _is_
   "not a declared failure". No caller pays a narrowing tax to reach `.status` on
   a 500.
3. **Both readers have a degraded second overload.** Handed something whose type
   never carried a union — a vanilla `useFetch`'s `NuxtError<unknown>`, or an
   `unknown` in a `catch` — they return `{ tag: string, status: number }
| undefined`, the shape floor the wire guarantees. That is a degradation
   rather than a compile error, on purpose.

The marker's _presence_ is not enough on its own: the floor is checked too, so a
marker that is present but malformed — a proxy rewriting bodies, a mangled
response, a hand-rolled imitation — reads as **undeclared** rather than as a
malformed declared failure.

---

## Fetching

### `useTypedFetch` / `useLazyTypedFetch`

A full five-overload mirror of vanilla `useFetch` that adds typings only.

```ts
// inside <script setup lang="ts">
const { data, error } = await useTypedFetch('/api/users/private')
const failure = useDeclaredError(error)
```

- **`error` keeps holding a `NuxtError`.** The wrapper never replaces the ref at
  runtime — Nuxt's `useAsyncData` unconditionally runs
  `asyncData.error.value = createError(error)`, so declaring `error.value` as a
  bare tagged union would type-check while lying. The honest declaration is the
  envelope, `NuxtError<DeclaredErrorBody<Declared>>`, and the reader is what
  moves your attention onto the flat union.
- **Every vanilla option carries over verbatim** — `transform`, `pick`,
  `default`, `lazy`, `watch`, `immediate` — and none can interact with the error
  typing, because the error type is computed from the request and method alone
  and never touches the data type.
- **`useLazyTypedFetch` is the same interface** with `lazy: true` supplied at
  runtime, exactly as vanilla does it.

**These two names have no hand-writable published specifier, and that is forced.**
They call `useFetch`, which lives behind `#app` — an alias that exists in the app
build only. None of this package's three specifiers may carry that import: `.` is
import-protected by Nuxt, `/types` is type-only, and `/shared` is loaded by Nitro
in a real production build. So the auto-import **is** the whole contract for these
two names, and a call site that wants the import written out reaches for Nuxt's
own `#imports`:

```ts
import { useTypedFetch } from '#imports'
```

**No fourth `exports` entry is offered, and none would help** — it would resolve
from the server and `shared/` contexts too, where it cannot work.

**There is no `useAsyncData` counterpart**, and there will not be one:
`useAsyncData(key, handler)` takes a _function_, not a route literal, so there is
no path for the map to be keyed by. A wrapper could only re-ask you for the route
— unverifiably; nothing would make the handler actually call the path it claims.
Both routes to typed errors already exist with no new API:

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
} from '@dphonys/nuxt-handler-errors/types'

const { error } = useAsyncData<
  User,
  DeclaredErrorBody<DeclaredErrorsOf<'/api/users/:id', 'get'>>
>('user', () => fetchUser())
```

> **Hoist the loader out of the `useAsyncData` call.** Written inline —
> `useAsyncData(() => $typedFetch('/api/users/1'))` — the arrow's return is
> contextually typed by `useAsyncData`'s own unresolved type parameter, which
> keeps the request type unresolved inside the fetch call and produces
> `TS2321 Excessive stack depth`, one per route in the app. **This is not this
> module's:** `useAsyncData(() => $fetch('/api/users/1'))` — vanilla, no part of
> this module in it — produces the identical diagnostics on the identical line.
> Hoisting removes the contextual type, and both spellings are then clean.
> Measured on this repo's pinned compiler, in the playground's own app program.
> It is the same rule as
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

The namespace mirrors vanilla's exactly: `raw` and `create`, and neither grows its
own `.safe`. `create` returns the _typed_ interface, so `.safe` survives on
created instances. `raw` is a passthrough in every respect but one — it does run
this module's header merge, because a `raw` call is still a request and its caller
is still entitled to read the marker off it.

### `event.$typedFetch` — server to server

Inside a Nitro handler, `event.$typedFetch` is the same surface bound to the
incoming request. It is `event.$fetch` plus `.safe` and nothing else — no `raw`,
no `create` — because that is exactly what `event.$fetch` is.

```ts
// server/api/chain/b.get.ts
import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/shared'
import { chainErrors } from '#shared/errors/chain'

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

(The caller's context object is reachable by a callee that really wants it, at
`event.node.req.__unenv__`. That is h3's and Nitro's behaviour; this module only
rides it.)

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
already works. That declaration is the act of publication: `fail('c-gone')` is a
compile error unless the tag is in the caller's own list, so leaking an internal
contract to the client is unrepresentable as an accident.

> **A route's declared union is exactly what it wrote in `errors: [...]`. Where a
> variant is _produced_ — in the handler body, in a helper, or forwarded from a
> callee — is invisible to the client and is not a design question.**

---

## Specifiers, and what is auto-imported

Three published specifiers. The bare `.` is import-protected by Nuxt in every
context including `shared/`, so it is never hand-written:

| Specifier                             | Holds                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `@dphonys/nuxt-handler-errors`        | the Nuxt module itself, for `nuxt.config.ts`                                                   |
| `@dphonys/nuxt-handler-errors/types`  | the public type surface, and the build-time augmentation target for the generated error map    |
| `@dphonys/nuxt-handler-errors/shared` | side-agnostic runtime values, importable from the client, the server and your `shared/` folder |

`/shared` carries `defineErrors`, `payload`, `defineTypedEventHandler`,
`invalidInput`, `declaredError`, `useDeclaredError` and `DECLARED_ERROR_KEY`.

`/types` carries `TypedApiErrors`, `DeclaredErrorsOf`, `DeclaredErrorBody`,
`ErrorCatalogue`, `VariantsOf`, `Payload`, `TypedEventHandler`, `ValidationIssue`,
`Flatten`, `TypedResult` and the rest of the public type surface.

**Auto-imports are additive sugar, never the contract** — with the one forced
exception noted above:

| Name                                 | How it is reached                                           |
| ------------------------------------ | ----------------------------------------------------------- |
| `declaredError`, `useDeclaredError`  | auto-imported app-side; `/shared` is the contract           |
| `useTypedFetch`, `useLazyTypedFetch` | auto-import **is** the contract; `#imports` to write it out |
| `$typedFetch`                        | a real `globalThis` property, on both sides                 |
| `event.$typedFetch`                  | on the event, server-side only                              |

`DeclaredErrorsOf` is worth naming explicitly, because remapping a callee's
failure is the blessed server-to-server shape:

```ts
import type { DeclaredErrorsOf } from '@dphonys/nuxt-handler-errors/types'

function toOrderFailure(e: DeclaredErrorsOf<'/api/users/:id'>): OrderTag {
  switch (e.tag) {
    /* … */
  }
}
```

---

## Hovers, and one practical rule

### What you will actually see

Hover legibility is a declaration-shape property here, not a cosmetic concern,
and it is under test as character-length budgets. Measured against a real app:

| What you hover                   | Rendered  | Verdict                       |
| -------------------------------- | --------- | ----------------------------- |
| the composable                   | 64 chars  | vanilla `useFetch` is 94      |
| `data.value`                     | flat      | identical to vanilla          |
| the reader's return, narrowed    | 182 chars | **this is what callers read** |
| `error.value`                    | 212 chars | honest, envelope-shaped       |
| `$typedFetch.safe`'s result      | 273 chars | flat                          |
| the reader's return, un-narrowed | 353 chars | serialization residue         |
| the `error` **ref** itself       | 904 chars | see below                     |

Two of those rows are worth a sentence each. **The `error` ref renders 904
characters** — one hover higher than `error.value`, on the destructured name
rather than on `.value` — because Vue 3.5 declares `Ref<T, S>` with two type
parameters and the envelope is printed into both. Nothing about the declaration
changes that; hover `.value`, or hover the reader's return, which is the one you
consult while writing the `switch`. And **the reader's un-narrowed return is
353** because `E | undefined` makes the union top-level and the map's own
wrappers become nested aliases; inside `if (failure)` it is 182 and flat.

### Depth, and one practical rule

Nitro's own `AvailableRouterMethod` recurses per character through route-matching
score conditionals, and meeting it with an unresolved generic can produce
`TS2321 Excessive stack depth` on some compilers. This predates the module —
vanilla `useFetch`'s signature contains the same expression, and Nuxt gets away
with it because it ships in a `.d.ts`, which `skipLibCheck` excuses.

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

**Versioning is by key rename, and that is a feature.** A future incompatible
envelope uses a new key; an old client sees no marker it recognises and falls
back to the undeclared channel — the conservative direction — with no
version-negotiation policy to write. The key deliberately does **not** track the
package name, so the package can be renamed, rescoped or relocated without
desynchronising a deployed server from a deployed client. Import it as
`DECLARED_ERROR_KEY` from `/shared` rather than writing the literal.

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

### Validation discloses field names before your handler's auth check

See [rule 4](#4-validation-runs-before-your-handler-body--including-before-your-auth-check).
Put auth in Nitro middleware.

### Forgetting the catalogue is silent, by design

Declare `body:` and forget to list `invalidInput`, and you get **no compile
signal**. Validation still runs and still 400s, unmarked. You find out when the
tag is missing from the client's union. A presence guard plus an opt-out flag
would catch that mistake and reintroduce the same silence through the flag, on
the most-read surface in the design.

### An undeclared route is silent too

A route that never opted in infers `never`, which is the honest statement — _"this
route declares no failures"_, not _"this route cannot fail"_. It is deliberately
not a compile error, because that is what the degradation lock requires. You get
no signal at all.

### `ExtractErrorsSafe` called directly on an index signature answers `unknown`

Reachable only by calling the type directly. Everything reachable _through the
generated map_ is closed: a route module carrying `[k: string]: unknown` is
neutralised there, because the map's own serialization wrapper maps `unknown` to
`never`. If you call `ExtractErrorsSafe<T>` by hand on such a type, guard it
yourself.

### One generated map entry is uninhabited

Nuxt registers its island renderer under an alias the path resolver does not
resolve, so `TypedApiErrors['/__nuxt_island/**']` points at no file and reads as
TypeScript's error type — which renders as `any` and satisfies whatever it meets.
`DeclaredErrorsOf<'/__nuxt_island/foo'>` therefore answers `any` rather than
`never`. The only fix is a filesystem read inside the pure emitter, which is
forbidden by design. The route is Nuxt-internal and the state is pinned by a test,
so the day it changes is visible rather than silent.

### The consumer-compiler gap

This repo type-checks on a pinned tsgo bridge, and that is the gate's contract.
**Downstream projects compile the emitted `.d.ts` with stock TypeScript, and
nothing in this repo's gate proves what they will experience.** The mitigation is
designed in and costs nothing today — the type-assertion harness takes its `ts`
module as a parameter, so a second compiler is a `describe.each` plus one aliased
devDependency — but it is not wired up.

### What is deliberately not protected

- **IDE completion lists.** The _message_ naming the allowed tags is asserted;
  actual completions are a language-service surface and nothing asserts them.
- **Dev-server wall-clock timing.** The invariant is tested structurally; the
  clock is not. `pnpm dev-race` ships as an ungated diagnostic for when a Nuxt or
  Nitro bump is suspected.
- **Editor experience beyond rendered strings** — go-to-definition, quick-info
  layout, squiggle placement.

### Coverage gaps in the shipped test suite

Stated because a silent gap is worse than a known one.

- **`types:extend` silently ceasing to fire is not caught by `pnpm check`.**
  Deleting the forced re-render leaves a `nuxt prepare` build byte-identical; it
  only costs regeneration on route change _in dev_. `pnpm dev-race` is the only
  observation that catches it, and it is ungated by design.
- **The client-side `$typedFetch` plugin's necessity has no assertion.** It is
  observable only in a browser, and no test tier here has its own runner. Its
  deletion is silent in `pnpm check`.
- **`optimization.keyedComposables` registration is measured but not tested.**
  The observation is a count of keys in Nuxt's SSR payload format, which is not
  something this module contracts for.
- **`event.$typedFetch` being absent client-side is untested**, as is plugin
  ordering against another plugin that replaces `event.$fetch`, and there is no
  rendering assertion taken _through_ `event.$typedFetch` against the real
  generated map.
- **The `@experimental` h3 augmentation `event.$fetch` rides is unguarded at
  runtime.** If h3 moves it, the failure is a compile error in one module file
  rather than a silent behaviour change in user code — which is why the ride was
  accepted — but nothing checks it at run time.

---

## Open questions

These are genuinely open. They were **not** considered and settled; they were
consciously not sharpened. An implementer or user who does not know that will
assume otherwise.

1. **Observability, and `captureError`.** Error-page escalation is already
   correct for free — Nuxt escalates only on `fatal || unhandled`, and a declared
   failure is neither. But **Nitro's `captureError` fires the `error` hook
   unconditionally**, so Sentry-style integrations see every declared failure as
   an error. Whether the module should suppress that, and how, is unresolved.
   There is a second, louder case with a different character: a callee's declared
   failure that a caller lets escape _is_ `unhandled`, and that is correct
   behaviour for a genuine caller bug — so it may want no suppression at all
   while the first case does. **The two halves may not have one answer.**
2. **Whether a project overriding `nitro.errorHandler` should be detected and
   warned about.** There is a third serializer in Nitro that **drops `data`
   entirely**. It is not on the default path, but a project pointing
   `errorHandler` at it would silently lose every declared payload, with no
   compile-time signal.
3. **Whether the unenforced `.raise()` escape hatch wants a backstop** — a lint
   rule, a dev-time check, or simply the documented rule above. Not sharp enough
   to ticket, and it probably wants real handler code to judge against.
4. **The adoption path for handlers that already exist and throw `createError` by
   hand** — whether the module offers incremental migration or is all-or-nothing
   per route. Untouched.
5. **Whether the module needs a devtools panel or a generated documentation
   surface.** Untouched.
6. **Whether the wire marker should be honoured on responses the app did not
   originate.** Marker presence is sufficient evidence, on the reasoning that a
   forged marker is no worse than a forged success payload — which holds for a
   first-party Nitro origin and is less obviously right for a `$typedFetch`
   pointed at an arbitrary external URL, which the degradation lock explicitly
   permits. This is now narrowed to exactly one surface: the _typed_ channel
   refuses a foreign marker for free (an external URL resolves the union to
   `never`, so `.safe`'s `ok: false` arm does not exist). What remains is the
   **runtime reader**, whose degraded overload reads the floor off any error
   whatsoever. Should it require a same-origin or first-party signal?
7. **Whether an opt-in, catalogue-driven skew-safe match helper is worth
   shipping.** The union is closed and the deploy-skew tail above is accepted. A
   caller _could_ recover exactness by passing a catalogue as the runtime tag list
   — the floor guarantee exists precisely so that is decidable — but a
   `server/`-only catalogue is legal, so it can never be more than opt-in.
   Probably wants real app code to judge against.

## Dissolved, not open

Three questions that look like they should be open, and are not. Each has a
reason, and the reason is short.

- **Result combinator vocabulary** (`map`/`andThen`/`gen`/exhaustive `match`) —
  **dissolved, not deferred.** `fail` throws and returns `never`, so no Result
  value ever flows through a handler body. A multi-step body is linear imperative
  code with early exits. There is nothing to combine.
- **Client runtime cost and bundle impact** — **dissolved, not deferred.** The
  composable half is one `useFetch` delegation plus a header merge; the readers
  are two small functions; the imperative half is one `$fetch` delegation, a
  `Headers` merge, and a `try`/`catch` calling that same reader. No new
  dependency, and no per-call allocation beyond the `Headers` object vanilla
  already builds. The whole client surface is accounted for. _(The server side
  does add per-request runtime presence via `event.$typedFetch` — that is a
  different bullet, and a taken decision rather than fog.)_
- **`<NuxtErrorBoundary>` and `showError` interplay** — **dissolved, not
  deferred.** The wrapper is typings-only: it never throws, never calls
  `showError`, and leaves `fatal`/`unhandled` alone, so the interplay is exactly
  vanilla's. Combined with Nuxt escalating only on `fatal || unhandled`, there is
  nothing to specify.

---

## Publication status

**This package is still `private: true`, and admitting it is a judgement call
rather than a risk.** Both gates the repository's publication boundary names are
closed: the scaffolded starter behaviour and starter prose are gone, and this
README documents the shipped surface. `pnpm check` and `pnpm knip` are green from
a cold cache, and `publint` reports no problems against a real `dist/`.

The recommendation is to admit it, at `0.1.0` rather than `0.0.1` — the surface is
complete against `SPEC.md`, and the version should say _usable, not yet stable_.
Weigh the consumer-compiler gap and the coverage gaps above first. **The call
belongs to the repository owner**; until `private` is removed the package is not
a Publishable package and owes no Release intent, so its first intent is the one
that accompanies its admission.

---

## About the design record

[`SPEC.md`](./SPEC.md) is shipped in the repository, and it is **the only tracked
artifact of the effort that produced this module**. The wayfinding map it cites,
its twenty research tickets and its six probe directories all live under a
gitignored `.scratch/` directory — so the relative links inside it resolve in the
working tree that produced it and nowhere else, and the evidence behind every
claim marked _measured_ exists in exactly one place.

Two consequences for a reader of the published package. The decisions survive in
full and are self-contained; the measurements that justified them are cited but
not reachable. And re-measuring is possible — every probe records how it was run
— but it is not free. `SPEC.md` was amended in place at the end of the
implementation effort against fifty-four measured contradictions, so what it says
now is what was built, not what was planned.

---

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-handler-errors dev
pnpm --filter @dphonys/nuxt-handler-errors typecheck
pnpm --filter @dphonys/nuxt-handler-errors test
pnpm --filter @dphonys/nuxt-handler-errors build
pnpm --filter @dphonys/nuxt-handler-errors publint

# ungated diagnostic: dev-server map convergence, for when a Nuxt/Nitro bump
# is suspected
pnpm --filter @dphonys/nuxt-handler-errors dev-race
```

`dev` builds the module for real before starting the playground. Two of the three
specifiers point inside `dist/runtime/`, and `nuxt-module-build --stub` replaces
that directory with a symlink to source, which breaks them — so `--stub` is
unusable here and no task may rely on it.

## License

Licensed under the [MIT License](./LICENSE).
