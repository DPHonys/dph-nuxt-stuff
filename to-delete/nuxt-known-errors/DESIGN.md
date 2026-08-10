# nuxt-known-errors — design

The settled design for the rewrite of `nuxt-handler-errors`. Built call-site
first, types only, in `sandbox/`:

```sh
pnpm --filter @dphonys/nuxt-known-errors typecheck
```

| File                              | What it is                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox/matcher.ts`              | **the design.** `matchError` and the fetch, asyncData and server surfaces                                                                   |
| `sandbox/call-sites.ts`           | **the evidence.** Every agreed call style, with assertions                                                                                  |
| `sandbox/fixtures.ts`             | framework replicas + three fictional routes. Not the design                                                                                 |
| `sandbox/glue/p2-array-spread.ts` | **the definition surface.** `defineError`, the errors slot, the brand, the raise contract — folded into the main three when internals start |
| `sandbox/glue/shared.ts`          | the pieces the glue redesign held fixed (`payload`, `fail`, the variant vocabulary)                                                         |

The full design log — the old package's diagnosis, every rejected alternative
with its reason, and the decisions that were overturned along the way — lives
in this file's git history. Do not re-propose a rejected shape without reading
it.

---

## 1. The surface

### The matcher

```ts
const { data, error } = await useCheckedFetch('/api/users/:id')

matchError(
  error,
  {
    forbidden: (e) => snack(`You need ${e.requiredRole}`),
    'user-not-found': (e) => notFound(e.userId),
    'user-suspended': (e) => blocked(e.until),
  },
  (err, unrecognized) => {
    if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
    showError(err)
  }
)
```

One call. `matchError` absorbs the `if (error)` and the is-it-known check.

- **Arms are exhaustive over the declared union.** Missing one is a compile
  error. Adding a variant server-side breaks every call site — the intended
  direction: the compiler reporting that a new failure exists.
- **Arms receive the whole variant** — `{ tag, status } & payload` — so
  `e.requiredRole` works and `status` is not thrown away.
- **The fallback is positional and required.** Positional: no key-namespace
  collision with user tags. Required: an omitted fallback could only ever
  swallow the unanticipated case; `() => {}` says the same thing deliberately
  and is greppable. Two overloads total, never three.
- **The fallback's second parameter is the unrecognized variant**, optional —
  `(err) => showError(err)` stays untouched. See §2.
- **The matcher returns `void`.** Arms handle; they do not produce. `void`
  still accepts any arm return value; it is the matcher's result that is
  nothing. Consequences, all wanted: `return matchError(…)` in a
  value-returning function is a compile error; `if (matchError(…))` is a
  compile error (TS1345); with no inferred `R`, nothing can pin the arms'
  types (§4).
- **The ref is read once, at call time.** The reactive form is composition,
  not a new function:
  `watch(error, () => matchError(error, …), { immediate: true })` —
  `immediate` also covers the lazy fetch, where the error arrives after setup.
  `MaybeRef` on the error parameter keeps the watcher callback a one-liner.
  No `watchError` API.

### The imperative surface — `$checkedFetch.try`

```ts
const { data, error } = await $checkedFetch.try('/api/users/:id')

if (error) {
  matchError(
    error,
    {
      forbidden: (e) => snack(`You need ${e.requiredRole}`),
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    (err, unrecognized) => {
      if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
      showError(err)
    }
  )
  return null
}

return data // narrowed to the route's response type
```

A `catch` variable is `unknown`; a return type is the only position that can
carry the declared union. `.try` exists for that reason and no other.

- **`$checkedFetch(…)` is vanilla, unchanged.** It throws, and a `catch` reads
  the floor through the degraded matcher.
- **`.try` catches everything a fetch can throw** — HTTP, network, abort,
  parse — and normalises to `NuxtError`, exactly as `useFetch`'s error ref
  does.
- **`error` is the carrier, not a flat variant**, so the same arms serve both
  surfaces.
- **`{ data, error }` is a discriminated union**; `if (error) return` narrows
  `data` with no second guard and no `!`. Verified: TS narrows the
  destructured sibling.
- **The success arm carries Nitro's own response type**, indexed out of
  `Base$Fetch`'s return position — plain `T`, no `null`, no `| undefined`.
  No `ok`; `error`'s presence is the discriminant.
- **`create` returns the typed interface.** **`raw` has no `.try`** — it
  already returns a non-throwing `FetchResponse`.
- **`$checkedFetch.native`** is ofetch's bare-`fetch` member, passed through
  untouched — dropping a vanilla member would break the mirror.

### The remaining vanilla mirrors

- **`useLazyCheckedFetch`** — `useCheckedFetch` with `lazy` pre-set, as
  vanilla's twin. The reactive matcher composition (`watch` + `immediate`) is
  the read that fits it.
- **`useRequestCheckedFetch()`** mirrors `useRequestFetch()` (SSR cookie
  forwarding for imperative app code). Its return is the honest seam type:
  vanilla hands back the bare `event.$fetch` closure on the server (§3), so
  anything beyond the call and `.try` would be typed and absent.

### The server surface — `event.$checkedFetch`

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
            message: `upstream gone: ${e.resource}`,
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

- **The client's imperative shape with `throw` as the exit.** Arms that know a
  specific answer throw the caller's own failure; the trailing generic throw
  is required because the compiler cannot know an arm throws.
- **The event surface is the seam exactly: the call and `.try`.** No `.raw`,
  no `.create` — Nitro types them on `event.$fetch` but never assigns them
  (§3), and `.create` has nothing to mean on an instance that _is_ the
  per-request customisation. **One seam interface `CheckedFetch`** (call +
  `.try`); the global `$CheckedFetch` extends it with `.raw` and `.create`;
  the event-bound instance is the seam exactly. `shared/` utils accept the
  seam as a parameter; the global stays reachable in `shared/` exactly as
  Nitro's `$fetch` global is.
- **Server-to-server is `.try` + translation arms, always.** An escaped
  callee throw cannot smuggle the variant (the framework scrubs it, §3) but
  leaks the callee's status line as the caller's answer. **Standing
  constraint: the tag must not ride `statusMessage`** — that is exactly how
  the old package's reason-phrase leak happened.
- **`useAsyncData` with a _throwing_ handler stays vanilla, degraded
  honestly.** Rejection types do not exist in TypeScript. The marker still
  reaches the error ref (§3), where the degraded matcher hands it to the
  fallback as `unrecognized`.

### The asyncData surface — `useCheckedAsyncData`

```ts
const userRepo = {
  get: (id: string) => $checkedFetch.try('/api/users/:id'),
}

const { data, error } = await useCheckedAsyncData('user', () =>
  userRepo.get(id)
)

matchError(
  error,
  {
    forbidden: (e) => snack(`You need ${e.requiredRole}`),
    'user-not-found': (e) => notFound(e.userId),
    'user-suspended': (e) => blocked(e.until),
  },
  (err) => showError(err)
)
```

Vanilla `useAsyncData` where the handler returns `.try` results instead of
throwing. No route is ever restated: the union rides the handler's return
type — the one typed channel into `useAsyncData`'s generics.

- **The expected common case is a repository.** The union rides the wrapping
  function's inferred return type — zero annotations anywhere. A multi-route
  method early-returns each failure; the union of carriers arrives at the
  matcher whole, with cross-route exhaustiveness.
- **Forgetting `.try` is a compile error** — the handler's constraint is the
  try-shape; a bare `$checkedFetch` call does not satisfy it.
- **The options are vanilla's own `AsyncDataOptions`, over the unwrapped
  success.** `transform` and `pick` see plain data, never a try-shape; the
  rest pass through. Import the type from nuxt; do not own an options type.
- **The keyless form** works by registering `useCheckedAsyncData` and its lazy
  twin in `optimization.keyedComposables` (§3). **`useLazyCheckedAsyncData`**
  is the same surface with `lazy` pre-set.
- **The runtime is unwrap-or-rethrow**: delegate to vanilla `useAsyncData`
  with `if (r.error) throw r.error; return r.data`. The carrier lands in the
  error ref identical (§3); `status`, `refresh`, `pending`, abort and dedupe
  are all vanilla's.
- **The matcher's typed overload is generic over the carrier**, not the
  variant union — a union of carriers (the multi-route handler) fails
  inference under an `E`-generic form (§4).

### The definition surface — `defineError` and the errors slot

```ts
// shared/errors.ts — or anywhere; the values travel, no registry exists
export const userErrors = defineError({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})

export const forbidden = defineError('forbidden', {
  status: 403,
  payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
})

// server/api/users/[id].get.ts
export default defineCheckedEventHandler(
  { errors: [...userErrors.pick('user-not-found'), forbidden] },
  async (event, { fail }) => {
    // …
    return fail('user-not-found', { userId })
  }
)
```

The unit is the **variant as a value**; a group is nothing but an array of
those values. `payload` and `fail` carry over from the old package unchanged.

- **`defineError` is one function for one or many.** `(tag, def)` returns a
  single `KnownError`; a defs record returns a `KnownErrorGroup` — an array
  of singles carrying `.pick()`. Arity separates the overloads, so neither
  can win on shape (§4's standing rule).
- **The slot is an array of singles; spread is the only composition
  operator.** `[...users, ...orders, forbidden]` — the declared union is read
  off the element union by one distributing conditional.
- **`.pick()` is permissive.** Repetition and emptiness are absorbed (a union
  dedupes itself); only a tag the group never declared is a compile error.
  **Standing runtime requirement: `pick()` and the handler's resolved errors
  list hold one error per distinct tag** — this also covers JavaScript
  callers no type guard reaches.
- **Divergence, not repetition, is guarded.** The same tag redeclared
  identically collapses silently; the same tag with a different status or
  payload breaks `fail` and the arms alike, so `ConflictGuard`
  (`IsUnion`-per-tag, intersected FIRST per the truncation lesson) reports it
  as a missing property naming the tag verbatim.
- **The handler carries its union out as `__knownErrors__?`** — an optional
  phantom, so a plain event handler still inhabits the type. This brand is
  the emitter's only channel. `KnownErrorsOfHandler` reads it back, guarded
  so an unbranded handler and `any` both land on `never` (§4).
- **The raise contract is structural.** `KnownRaiseInput` is what the raise
  may hand `createError`: `statusCode`, `message`, the marker under `data` —
  and `statusMessage?: never`, turning the standing constraint into a compile
  error at the one place it could regress. `message` MAY carry the tag: the
  prod handler scrubs it on any escape (§3), so it only reaches the route's
  own client, which knows the tag already.

### Why the two surfaces read differently

A top-level `return` in `<script setup>` is a hard compile error (§3). The
composable's `data` is a `Ref` handed to a template that copes with
`undefined` natively; a function can return and goes on to use `data` in the
same scope.

|                     | can `return`? | shape                                           |
| ------------------- | ------------- | ----------------------------------------------- |
| `<script setup>`    | no            | `useCheckedFetch` + bare `matchError(error, …)` |
| inside any function | yes           | `$checkedFetch.try` + `if (error) { … return }` |

### Vocabulary and names

**failure** is the noun for the thing; **known / unknown** is the distinction;
**checked** is the modifier for the surfaces — a checked surface is one whose
failure path the compiler enforces (checked as in checked exceptions).
`error` stays Nuxt's word for the envelope.

- **The `checked` family**: `useCheckedFetch`, `useLazyCheckedFetch`,
  `useRequestCheckedFetch`, `$checkedFetch`, `event.$checkedFetch`,
  `useCheckedAsyncData`, `useLazyCheckedAsyncData`,
  `defineCheckedEventHandler`; types `CheckedFetch` (the seam),
  `$CheckedFetch`, `CheckedEventHandler`. `checked` replaced `typed`
  (vanilla `$fetch` is already typed; and renaming forces migrators to read
  the new contract instead of migrating silently).
- **Word order**: vanilla's modifier keeps vanilla's position, `Checked`
  stays glued to the noun — `useLazyCheckedFetch`, not `useCheckedLazyFetch`.
- **The `known` family**: `KnownVariant`, `KnownError`, `KnownErrorGroup`,
  `KnownErrorBody`, `KnownErrorCarrier`, `KnownErrorsOf`,
  `KnownErrorsOfHandler`, `KnownRaiseInput`, wire marker `__knownError__`,
  handler brand `__knownErrors__`. Also `matchError`, `defineError`,
  `payload`, `fail`, `ConflictGuard` / `DivergentTags`, and the asyncData
  helpers `TrySource` / `SuccessOf` / `FailureOf`.
- **The fallback's parameters are `(err: NuxtError, unrecognized?)`.**
  `NuxtError` is structurally true of both runtimes (§3); no package-owned
  alias. `unrecognized` is American spelling, per ecosystem convention.
- **`status` is the one word for the status, on both layers.** The wire floor
  says `status`, and Nuxt 4.5's `NuxtError` deprecates `statusCode` in its
  favor. **Standing requirement: the server-side `.try` normalization must
  populate `status` on the carrier it hands out** — a bare `H3Error` sets
  only `statusCode`, and the `NuxtError` face must be runtime-true on both
  runtimes.
- **The package takes back the old identity**: ships as
  `@dphonys/nuxt-handler-errors`, module name `nuxt-handler-errors`,
  configKey `handlerErrors`. `nuxt-known-errors` is the sandbox's placeholder
  only and never publishes. The generated-map interface (`KnownApiErrors` in
  the fixtures) and the emitter's virtual module id follow the known
  vocabulary.

---

## 2. `unrecognized` — the fallback's second parameter

Exhaustive arms fully cover "I forgot to handle a known error"; this parameter
is a different case. Its one honest meaning across both producers is
**"known to the server, not to this call site"**, typed as the floor
`{ tag: string; status: number }`:

- **Deploy skew on a typed call** — the server runs a newer build and sends a
  tag this bundle never compiled against. Realistic trigger: a tab left open
  across a deploy. No type system can catch it; the matcher routes it here
  instead of letting it reach an arm typed as something it is not (the old
  package's documented unsoundness).
- **A degraded call site** — vanilla `useFetch`, a custom throwing
  `useAsyncData` handler, a bare `catch`. There are no typed arms at all, and
  the framework's `createError` copy still carries the marker (§3); every
  marked variant lands here.

---

## 3. Verified facts about the framework

Checked against the installed Nuxt 4.5.1 / Nitro 2.13.4 / h3 1.15.11 and the
built playground output. Re-verify on a major bump; do not re-derive from
memory.

**`isJsonRequest` is genuinely unreliable, and the `accept` header merge is
load-bearing.** Nuxt inserts its error handler _ahead_ of Nitro's
(`errorHandlers = [nuxt, nitro]`) and bails with
`if (event.handled || isJsonRequest(event)) return` — bailing is what lets
Nitro's JSON handler run and preserve `data`. The predicate falls back to
`event.path.startsWith('/api/')`, and during SSR:

- `accept` **is** stripped from forwarded requests (`getProxyRequestHeaders`'
  `ignoredHeaders` includes it), so the document's `text/html` does not poison it
- `sec-fetch-mode` is **not** stripped, and a document navigation's value is
  `navigate`, which does not contain `"cors"`

So SSR falls all the way to the path test. It fails for routes outside
`/api/**` and under a non-root `app.baseURL`. Browser-side is fine
(`fetch()` sends `sec-fetch-mode: cors` even same-origin).

ofetch never rescues it: **1.5.1** (what Nuxt 4.5 pins) has no `accept` logic at
all; **2.0.0-alpha.3** sets it only inside
`if (body && isPayloadMethod(method))`, so GETs still miss it under Nitro 3.

**Augmenting vanilla is blocked — the shadow names are forced.** `$Fetch` _is_
an interface, but `ofetch` does not declare it — it lives in a content-hashed
chunk and is re-exported, and an augmentation merges only with an interface
declared in the module the specifier resolves to; a re-exported one is
shadowed silently. `AsyncData` has the same shape. `globalThis.$fetch` is a
`var` — not augmentable at all.

**A top-level `return` in `<script setup>` is a compile error.** Measured on
@vue/compiler-sfc 3.5.40: `'return' outside of function` — the block is parsed
as a module body before splicing into `setup()`. Top-level `await` is fine.

**Vanilla `$fetch` resolves to `TypedInternalResponse<R, T, M>`** — plain `T`,
no `null`, no wrapper (nitropack `dist/types/index.d.ts:130`). `useFetch` is
`data: Ref<DataT>` with `| undefined` baked in (nuxt
`dist/app/composables/asyncData.d.ts:108`). `.try` follows `$fetch`.

**The variant's client-side path is `error.data.data.__knownError__`, and both
`data`s are the framework's.** The server throw puts the variant in
`H3Error.data`; Nitro's default JSON handler serializes
`{ error, url, statusCode, statusMessage, message, data: error.data }`
(nitropack `runtime/internal/error/prod.mjs:55-61`); ofetch's
`FetchError.data` is a getter over the parsed body; and `useAsyncData` wraps
the caught `FetchError` through h3's `createError`, which copies `input.data`
across (nuxt `asyncData.js:375`, h3 `dist/index.mjs:64`). Flattening the wire
would mean replacing the Nitro handler and owning the `isJsonRequest` fact
forever; `matchError` being the only read path makes the depth cost nothing.
Also measured: the prod handler sends `data: undefined` and
`message: "Server Error"` when the error is `unhandled` or `fatal`, so only a
deliberate `createError` throw carries a variant at all.

**The escape chain scrubs the variant but not the status line.** When handler
A calls route B and B's failure escapes A: ofetch throws a `FetchError` whose
`statusCode`/`statusMessage`/`data` are getters over B's response; h3's
listener catch wraps any non-`H3Error` through `createError` — copying
`statusCode`, `statusMessage` and `data` — and sets `unhandled = true` (h3
`dist/index.mjs:2318-2321`); Nitro's prod handler treats `unhandled || fatal`
as sensitive and sends `message: "Server Error"`, `data: undefined` — but
`status = error.statusCode || 500` and `statusText = error.statusMessage`
pass through untouched (nitropack `runtime/internal/error/prod.mjs`). So the
callee's variant cannot reach the caller's client, while the callee's status
line leaks as the caller's own answer.

**Nitro types `event.$fetch` as more than it assigns.** The type is
`Base$Fetch<unknown, NitroFetchRequest>` via a `declare module "h3"`
augmentation (nitropack `dist/types/index.d.ts:237`); the runtime assignment
is a bare arrow over `fetchWithEvent` (`runtime/internal/app.mjs:62`).
`.raw`, `.create` and `.native` exist in the type and not on the object.
Also `@experimental`, per Nitro's own doc comment; the old package's
first-call guard exists for that skew and stays right.

**`H3Event` _is_ augmentable — the one vanilla surface that is.** h3 declares
the class directly in its resolvable `dist/index.d.ts:29`; Nitro ships
exactly this augmentation itself, and the old package's
`declare module 'h3' { interface H3Event { … } }` shipped and held. Caveat:
an augmentation binds to a resolved path, so a consumer with two physical h3
copies lands it on the wrong one — pinning h3 stays forbidden.

**The server-side carrier has the client's shape, made by the same copy.** An
`event.$fetch` failure is a `FetchError` whose `data` getter is the parsed
callee body; h3's `createError` copies `input.data` across. So a server
`.try` normalising through `createError` yields
`error.data.data.__knownError__` at exactly the client chain's depth, and one
matcher serves both runtimes. Structurally, an `H3Error` also satisfies the
`NuxtError` interface — every Nuxt-only member is optional — with the
`status`-population standing requirement (§1) making the face runtime-true.

**A carrier rethrown into `useAsyncData` lands in the error ref identical.**
Nuxt assigns `asyncData.error.value = createError(error)` on a handler
rejection (nuxt `asyncData.js:375`), and h3's `createError` short-circuits on
its own errors — `if (isError(input)) return input` (h3
`dist/index.mjs:140,68`). No re-wrap, no depth change — this is what makes
`useCheckedAsyncData`'s runtime nothing but unwrap-or-rethrow.

**Nuxt's key injection is a module-extensible registry.** The compiler
injects a key for every function listed in
`nuxt.options.optimization.keyedComposables` — an array of
`KeyedFunction { name, source, argumentLength }` (@nuxt/schema
`dist/index.d.mts:1559,3079`) that modules push onto. Registering
`useCheckedAsyncData` and its lazy twin there gives the keyless form for
free.

**Hydration preserves the marker.** AsyncData errors ride the payload as
`payload._errors[key]`, serialized by the `NuxtError` devalue reducer through
`H3Error.toJSON()` — which includes `data` whenever set (h3
`dist/index.mjs:50-61`) — and revived client-side through
`createError(data)`, which copies `data` across (nuxt
`revive-payload.server.js:9`, `revive-payload.client.js:17`). The matcher
works on hydrated errors unchanged.

**`useRequestFetch()` returns the bare event closure on the server.** Three
lines (nuxt `ssr.js:37-40`): the global `$fetch` on the client,
`useRequestEvent()?.$fetch || $fetch` on the server — so on the server the
members beyond the call do not exist at runtime, and the seam is the honest
type for a typed mirror.

**A user-declared type predicate does not narrow a destructured sibling.**
Given `{ data: T; error: undefined } | { data: undefined; error: NuxtError }`,
`if (error) return` narrows `data` to `T`, but `if (isX(error)) return` does
not — TS's dependent-binding analysis runs off discriminant and truthiness
checks, not predicates. This killed the guard-shaped matcher.

**TS1345 does not fire on `void | undefined`.** `if (f())` where `f` returns
`void` is an error; `void | undefined` compiles and is always falsy.
Measured on TS 5.9.3 — the reason the matcher returns plain `void`.

**Nitro's error handler is a chain a module can join, and the builtin always
terminates it.** `nitro.options.errorHandler` accepts an array;
`resolveErrorOptions` (nitropack 2.13.4 `core/index.mjs:637-646`) normalises
a single value to one and **appends the builtin prod/dev handler last**. The
virtual `#nitro-internal-virtual/error-handler` runs the chain in order,
stopping when `event.handled`, passing each handler
`(error, event, { defaultHandler })` and swallowing a handler's own throw
(`rollup/index.mjs:1690-1703`). `defaultHandler` **returns**
`{ status, statusText, headers, body }` without sending — `body.data` is
`error.data` — so a prepended handler can render a modified body itself.
Nuxt sets its own handler **only when the slot is empty**
(`@nuxt/nitro-server` `dist/index.mjs:513`) and calls the `nitro:config`
hook after that and before `createNitro` (lines 775/817), so a module that
prepends there while preserving existing entries composes with both Nuxt's
handler and a consumer's custom one. Measured live in the playground: a
prepended stripper answered a tokenless declared failure with `data` gone
and the status line intact, deferred a token-carrying request to the builtin
untouched, and left a foreign error's own `data` untouched. Dev-only
wrinkle: the dev builtin's body carries `stack`, so a stripper that spreads
`res.body` forwards it — prod's does not.

**`captureError` fires the `error` hook before the error-handler chain
runs.** `onError` is `captureError(...)` then `errorHandler(error, event)`
(`runtime/internal/app.mjs:43-45`), so response-side stripping is
structurally invisible to observability. Measured live: the hook received
the marker on exactly the requests whose responses went out stripped.

**The marker sits at two depths, and the recognizer must read both.**
Raise-site: the server's own thrown `H3Error` carries it at
`error.data.<marker>` — depth 1, the shape the `error` hook sees for a
route's own declared failure. Fetched carrier: a server-to-server failure
carries it at `error.data.data.<marker>` — depth 2, measured identical on
the raw `FetchError` and after h3's `createError` (which wraps the
`FetchError` into a **new** `H3Error` while copying `data` across). An
escaped callee failure reaches the hook at depth 2 with `unhandled` set —
the pair the observability recipe keys on.

---

## 4. Type-level constraints, measured in the sandbox

Each of these compiled and looked correct while being wrong. The
implementation must preserve them.

- **`NoInfer` breaks inside a mapped-type key.** `Arms<NoInfer<E>, R>`
  silently turned every arm parameter into `never` on the good path while
  still type-checking.
- **An overload that can win on shape alone must not precede a more
  informative one.** On a degraded union `E['tag']` is `string`, so
  `Arms<E, R>` collapses to an index signature matching almost any object
  literal. (Arity-separated overloads, as in `defineError`, are immune —
  this is the standing rule.)
- **The degraded overload must take `Record<string, never>` (i.e. `{}`
  only).** Its error parameter is `unknown`, so it is assignable from every
  call — with any permissive arms type it silently disabled exhaustiveness
  on typed calls missing an arm. The degraded surface matches no tags and
  reads them off the fallback's second parameter.
- **The arms return `void`; there is no inferred `R`.** Any inferred arms
  return type either blamed the wrong argument when arms disagreed, fell
  through to the degraded overload, or (aggregated whole) leaked
  `| undefined` into every util writing `return matchError(…)`. Handling
  has no result; with no `R`, nothing can pin the arms' types.
- **The typed overload is generic over the carrier, not `E`.** An
  `E`-generic overload fails on a union of carriers (the multi-route
  handler) — it infers `E` from one member and rejects the call. Infer the
  carrier and extract with a naked distributing conditional
  (`VariantOf<C> = C extends KnownErrorCarrier<infer E> ? E : never`).
  Measured as a strict widening. Side benefit: `E` has no inference site,
  so the `NoInfer` class of bug loses its foothold.
- **An optional phantom brand on a VALUE is a weak type every object
  matches.** The brand on values (`KnownError`) is **required** — the
  implementation attaches a marker or casts. The brand on the **handler**
  stays optional deliberately (a plain `EventHandler` must inhabit
  `CheckedEventHandler`) — safe only because the extractor is the single
  reader and it guards.
- **An unbranded function matched against `{ __knownErrors__?: infer E }`
  infers `E = undefined`, not `unknown`.** So `Exclude<E, undefined>` is
  the entire unbranded guard; an `unknown extends E` belt was measured dead.
  `IsAny` is still required and separate — `any` matches everything with
  `E` unresolved.
- **`@ts-expect-error` anchors on the arms argument** when the error
  argument is well-typed and only the arms are wrong; when the error is
  `unknown` (a `catch`), both overloads fail and the directive sits above
  the whole call (`TS2769`). Both placements live side by side in
  `call-sites.ts`.

---

## 5. The internals — requirements

The requirements for the implementation, on top of the old package's
per-piece take / adapt / drop inventory (`INTERNALS-ANALYSIS.md` — the
emitter and wiring schedule carry nearly whole; the catalogue runtime
carries as ideas; `statusMessage: tag` and `.safe`'s rethrow semantics are
dead).

### Payload schemas — standardSchema, inference-only

The payload position accepts a Standard Schema (`zod`, `valibot`, anything
carrying `~standard`) as an alternative to `payload<T>()`, which stays as
the no-library door. The payload type is read via `InferOutput`; the
serializability constraint applies to the inferred output. **The schema is
never executed by this package** — decided deliberately: client-side
execution would need the defs at the call site, raise-site execution poses
the error-while-erroring problem, and the planned validation package is the
natural owner of runtime checking. `@standard-schema/spec` is types-only,
so the dependency costs nothing at runtime. The emitter, `ConflictGuard`
and the brand consume the payload _type_, however obtained.

### Channel gating — strip the marker for callers that are not the app

A token, set by the consumer (runtimeConfig/env), that every fetch surface
of this package attaches as a custom `x-` request header — the same
attach-a-header machinery as the load-bearing `accept` merge, in all three
merge forms. Server-side, a response to a request without the token has the
marker **stripped at serialization**: third parties get an ordinary error
response; the app's own calls (browser and SSR alike) get the full wire.

- **The thrown error always carries the marker; only the serialized
  response is ever stripped.** The Sentry-stability requirement:
  observability sees tags on every known failure or on none, never
  depending on who called.
- **The token is a channel tag, not a secret.** It ships in the client
  bundle and is visible in devtools; it marks first-party intent. The docs
  must frame it as that, never as authentication.
- Enabled by the token's presence; absent means today's behavior. No
  `ModuleOptions` entry needed.
- **The stripping seam is measured and holds** (§3): prepend an entry to
  Nitro's `errorHandler` array at `nitro:config`, preserving existing
  entries; render `defaultHandler`'s body with the marker stripped for
  tokenless marked requests and defer otherwise; foreign errors pass
  untouched. Owning `nitro.errorHandler` wholesale stays off the table.

### Core / module layering — structure now, extraction later

Two layers from the first commit: a **core** (wire, raise path, matcher
runtime, definition surface, recognizer) that imports nothing from
`@nuxt/kit`, `#app`, or the Nitro runtime, and a **module** layer (plugins,
composables, emitter wiring) consuming it. The planned sibling packages —
params/body validation, OpenAPI generation — and the umbrella module are
why the boundary exists; **extraction into published packages waits until
the second consumer is real**, so the handler-composition seam (one definer
carrying errors _and_ validation) gets designed against two real consumers
with veto power. Noted for then: the OpenAPI package needs schema _values_
at build time — a different channel than the type map, whose
never-catalogue-content rule is unchanged — and a shared core makes the
foreign-copy runtime guard more load-bearing, not less.

### Observability — a recognizer, and the integration decides

Nitro's `captureError` fires the `error` hook unconditionally with no
cancellation, so the module suppresses nothing and never will. It ships a
server-side **recognizer** over the wire floor — the variant or
`undefined` — handling **both marker depths** (§3: `data.__knownError__` on
the server's own thrown error, `data.data.__knownError__` on a fetched
carrier), plus the documented recipe: filter in Sentry's `beforeSend` or
the consumer's own `error` hook, keyed on the recognizer **and**
`unhandled === false` — a route's own declared failure is filterable while
an escaped callee failure still reports as the caller bug it is. Whether
known failures appear in Sentry is the integration's one-line choice,
stable by the always-marked rule above.

### Accepted for v1

- **The foreign wire marker on the degraded reader** — accepted and
  documented: a forged marker is no worse than a forged success payload,
  and the degraded fallback types only the floor. Revisitable compatibly.
- **The catalogue-driven skew-safe match helper** — out of v1, future work;
  the `unrecognized` fallback already handles skew honestly.

---

The design and its measurements are complete; nothing is implemented yet.
