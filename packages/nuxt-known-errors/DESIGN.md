# nuxt-known-errors — design log

A rewrite of `nuxt-handler-errors`, started because the old package **worked but
did not feel good to use**. This file records what that feeling turned out to
be, what has been decided, and what was rejected — so none of it gets
relitigated.

The rewrite is being built **call site first**. No emitter, no runtime, no
module. Types only, in `sandbox/`, until the way it reads is settled.

```sh
pnpm --filter @dphonys/nuxt-known-errors typecheck
```

Five files, and no more. Reasoning lives here, not in comments.

| File                              | What it is                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox/matcher.ts`              | **the design.** `matchError` and the fetch, asyncData and server surfaces                                                                                                  |
| `sandbox/call-sites.ts`           | **the evidence.** Every agreed call style, with assertions                                                                                                                 |
| `sandbox/fixtures.ts`             | framework replicas + three fictional routes. Not the design                                                                                                                |
| `sandbox/glue/p2-array-spread.ts` | **the definition surface.** `defineError`, the errors slot, the brand, the raise contract — design and evidence in one file, folded into the main three when step 6 starts |
| `sandbox/glue/shared.ts`          | the pieces the glue redesign held fixed (`payload`, `fail`, the variant vocabulary)                                                                                        |

Earlier sandbox files — `api.ts` and the guard-based sketches, `alternatives.ts`,
`fetch.ts`, `map.ts`, `replica.ts` — have been deleted. Everything they
established is in §4 and §6; keeping the code around invited re-reading rejected
shapes as if they were live.

---

## 1. What was actually wrong

The old package's surface was ten names shadowing four vanilla ones. The
diagnosis that stuck was narrower than "too many names":

**The composable path — the one Nuxt pushes you toward first — was the worst
path.**

```ts
const { data, error } = await useTypedFetch('/api/users/private')
const failure = useDeclaredError(error) // extra name
const current = failure.value // extra line, and a paragraph of docs
if (current?.tag === 'user-suspended') {
  /* … */
}
```

Three names and three lines to read one error, while the _imperative_ surface
(`$typedFetch.safe`) did it in two. The README had to teach "narrowing lands on
a local const" as a rule, which is the tell: **when docs explain a workaround
for the ergonomics, the ergonomics are the defect.**

Root cause: `useDeclaredError` is a **reader** — it returns a new value, so
narrowing has to be re-established on a fresh binding. A **guard** or a
**matcher** narrows what you already have.

Second root cause, found later: the author's mental model was _"an error is
either one I know or an unknown HTTP error"_ — one thing, two states. The
implementation was _two separate channels distinguished by presence_. Working
code, mismatched model.

---

## 2. Locked

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

One call. No guard, no nesting, no reader, no `.safe`. `matchError` absorbs the
`if (error)` and the is-it-known check.

**Decisions inside that, each with its reason:**

- **Arms are exhaustive over the declared union.** Missing one is a compile
  error. This is what makes the fallback mean exactly one thing — the earlier
  `default` had to cover both "a known tag I skipped" and "something broke",
  and that ambiguity was the thing that felt unresolved. Cost, accepted:
  adding a variant server-side breaks every call site. That is the _good_
  direction — it is the compiler reporting that a new failure exists.

- **Arms receive the whole variant, not just the payload.** A variant is
  `{ tag, status } & payload`, so `e.requiredRole` already works and `status`
  is not thrown away.

- **The fallback is positional, not a reserved key.** `default` and `_` share a
  namespace with user-chosen tags, and `default` is _already_ spoken for as a
  method key in the generated map. A positional argument has no collision
  surface.

- **The fallback's second parameter is the unrecognized variant.** Optional, so
  `(err) => showError(err)` is untouched. See §3.

- **The fallback itself is required.** It was optional; the two-argument form
  is gone. Arms are exhaustive over _known_ failures, so the only thing an
  omitted fallback could ever swallow is the case nobody anticipated — the 500,
  the timeout, the deploy skew of §3. Silencing that by omission is the
  opposite of what exhaustive arms are for: under `if (error) { matchError(…) }`
  it means taking the failure branch and doing nothing at all. `() => {}` says the same thing deliberately, and is greppable.
  It also **deletes an overload** — three down to two — which matters given that
  §6 records two separate bugs caused by an overload winning on shape.

- **The matcher returns `void`. Arms handle; they do not produce.** This
  replaces an earlier decision that arms return values and the call works as an
  expression — see §6 for the evidence that overturned it. `void` absorbs
  whatever an arm returns, so `() => navigateTo('/x')` is still a legal arm; it
  is the _matcher's_ result that is nothing. Three consequences, all wanted:

  - `return matchError(…)` is a compile error wherever the enclosing function
    returns a value, so a util cannot leak `void` into its own return type. It
    remains legal in a `void` function, but the sandbox never writes it: the
    matcher is a statement, and the `return` that follows is the function's own.
  - `if (matchError(…))` is a compile error. TS1345 rejects truthiness on
    `void` but **not** on `void | undefined`, which is what the aggregating
    signature returned — so that hole closes by itself.
  - With no inferred `R`, nothing can pin the arms' return type, and the
    §6 trap cannot recur.

- **The ref is read once, at call time.** Correct right after
  `await useCheckedFetch(…)`; stale across a `refresh()`. The reactive form is
  **composition, not a new function** — read-at-call-time is exactly what makes
  `watch(error, () => matchError(error, …), { immediate: true })` correct on
  every change, and `immediate` also covers the non-awaited (lazy) fetch, where
  the error arrives after setup. Zero new API: a `watchError` would be a second
  matcher with a different lifecycle contract, and Vue already owns the word
  for "re-run when that changes". `MaybeRef` is what keeps the watcher callback
  a one-liner. Cost, accepted: side-effect arms re-fire on every failed
  refetch — usually wanted, and the visible difference between the two styles.

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

Everything here follows from one fact: **a `catch` variable is `unknown`.** The
route literal is on the _call_; there is no channel from a call expression into
a sibling `catch` block. A return type is the only position that can carry the
declared union. `.try` exists for that reason and no other.

- **`$checkedFetch(…)` is vanilla, unchanged.** It throws, and the `catch` reads
  the floor through the degraded matcher. That path stays honest rather than
  pretending — see the rejected route-restating escape hatch in §4.

- **`.try` catches everything a fetch can throw** — HTTP failure, network
  failure, abort, parse error — and normalises to `NuxtError`, exactly as
  `useFetch`'s error ref already does. This is the change from the old
  `.safe`, and the reason for it is §1's own diagnosis — see the `.safe` row
  in §4.

- **`error` is the carrier, not a flat variant.** The old `.safe` handed back
  `Flatten<D>` — `{ tag, status, …payload }` — as its substitute for a matcher.
  Now that the matcher exists, a flat variant is the one shape it cannot
  consume. Handing back what the composable's error ref holds is what lets the
  _same arms_ serve both surfaces.

- **`{ data, error }` is a discriminated union**, so `if (error) return` leaves
  `data` as `T` with no second guard and no `!`. Verified: TypeScript narrows
  the sibling binding through the destructuring.

- **The success arm carries Nitro's own response type**, indexed out of
  `Base$Fetch`'s return position rather than restated — plain `T`, no `null`,
  no `| undefined`. `data: undefined` on the failure arm is not a deviation
  from vanilla; it is the arm vanilla spells as `throw`, which has no value.

- **`ok` is gone.** `error`'s presence is already the discriminant.

- **`create` returns the typed interface**, or `.try` silently vanishes one
  level down. **`raw` has no `.try`** — it already returns a `FetchResponse`
  with `status` and `_data` without throwing, so a `.try` there would be a
  third channel for the thing `.try` exists to make singular.

- **`try` is the word**, replacing `safe`. It names the construct it deletes.
  `safe` carried a different contract in the old package, and reusing the name
  for a changed one is a migration hazard. Verified legal as a property name in
  an interface, an object literal and a bare reference. This also settles
  `event.$checkedFetch.try` for the server-to-server session: one word per
  concept means it is forced, not open.

### The remaining vanilla mirrors

Found by sweeping Nuxt's exported client surface against the locked one; each
is a one-line reuse of an existing decision, recorded so the sweep does not
need re-running.

- **`useLazyCheckedFetch`** mirrors `useLazyFetch`: the same surface as
  `useCheckedFetch` with `lazy` pre-set, exactly as the asyncData twin. The
  error arrives after setup, and the reactive matcher composition
  (`watch` + `immediate`, §2) is the read that fits it.

- **`useRequestCheckedFetch()`** mirrors `useRequestFetch()`, the SSR-safe
  imperative fetch for app code — without it, a bare `$checkedFetch` call in a
  composable forwards no cookies during SSR. The seam is its honest type:
  vanilla returns the global on the client and the **bare** `event.$fetch`
  closure on the server (§5), so anything beyond the call and `.try` would be
  typed and absent — the same reasoning that shaped `event.$checkedFetch`.

- **`$checkedFetch.native`** is ofetch's bare-`fetch` member, passed through
  untouched. A `Response` has no error channel to type, and dropping a
  vanilla member from the object we shadow would break the mirror — the
  omission would otherwise be the only undocumented difference.

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

- **The shape is the client's imperative shape with `throw` as the exit.** A
  handler's throw _is_ its error response, so the exit statement after the
  match block is the handler's generic answer, exactly as `return null` is a
  util's. Arms translate: one that knows a specific answer throws the caller's
  own failure and thereby overrides that generic exit per-tag. The compiler
  cannot know an arm throws, so the trailing exit is required — that is the
  same division of labour as the client's, not a workaround.

- **The event surface is the seam _exactly_: the call and `.try`. No `.raw`,
  no `.create`.** Measured (§5): Nitro types `event.$fetch` as the full
  `Base$Fetch` but assigns a bare closure — `.raw` and `.create` are typed and
  absent at runtime. Mirroring the full interface would inherit the lie.
  `.create` also has nothing to mean here: an event-bound instance _is_ the
  customisation.

- **One seam interface** — `CheckedFetch`, the call plus `.try`. The global
  `$CheckedFetch` extends it with
  `.raw` and `.create`; the event-bound instance is it exactly. A `shared/`
  util that lets its caller choose the request context accepts the seam as a
  parameter and is handed `event.$checkedFetch` on the server and `$checkedFetch`
  everywhere else — the same arms serve both. The global itself stays
  reachable in `shared/` exactly as Nitro's own `$fetch` global is, with the
  same context-less semantics: the mirror-of-vanilla rule, not a new decision.

- **The old "prefer `.safe` server-to-server" calculus is resolved, not
  carried over.** The rule is `.try` + translation arms, and the reason is now
  measured rather than feared. An escaped callee throw cannot smuggle the
  callee's variant to the caller's client — h3 flags the non-`H3Error` as
  `unhandled`, and Nitro's prod handler then scrubs `message` and `data` (§5).
  What does pass through untouched is the callee's **status line**:
  `statusCode` and `statusMessage`. So an escape is sound but wrong — the
  route answers with a status it never meant, plus an `[unhandled]` console
  error. And the old package's documented leak ("the callee's tag as the HTTP
  reason phrase") turns out to have been its own wire's fault: it wrote
  `statusMessage: tag`. **Standing constraint for the definition step (roadmap 4): the tag must not
  ride `statusMessage`**, or escapes leak it again.

- **`useAsyncData` with a _throwing_ handler stays vanilla, degraded
  honestly.** Rejection types do not exist in TypeScript, so no typing can
  ride a handler's throw (§4). Nothing is lost at runtime: the framework's own
  `createError` copy carries the marker into the error ref (§5), where the
  degraded matcher hands it to the fallback as `unrecognized`. The typed path
  is the next section — the handler returns instead of throwing.

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
throwing. This overturns nothing in §4 — the rejected wrapper took a **route
type parameter** and could lie about it. Here no route is ever restated: the
union rides the handler's **return type**, which is the §2 axiom ("a return
type is the only position that can carry the declared union") applied to the
one typed channel into `useAsyncData`'s generics.

- **The expected common case is a repository.** Components rarely spell
  routes; they call a function that wraps `.try`, and the union rides that
  function's inferred return type — zero annotations at the call site, at the
  repository, anywhere. A repository method touching two routes early-returns
  each failure and hand-builds its success; the resulting union of carriers
  arrives at the matcher whole, with cross-route exhaustiveness. Repositories
  for `shared/` take the seam as a parameter, as everywhere.

- **Forgetting `.try` is a compile error, not a silent degradation.** The
  handler's constraint is the try-shape; a bare `$checkedFetch` call resolves to
  plain data and does not satisfy it. The discipline the shape needs is
  enforced by the signature, not taught by docs.

- **The options are vanilla's own, over the unwrapped success.** `transform`
  and `pick` see plain data, never a try-shape; `default`, `lazy`, `server`,
  `immediate`, `deep`, `dedupe`, `watch`, `getCachedData` pass through. The
  real package imports `AsyncDataOptions` from nuxt rather than owning an
  options type — that is what "as close to vanilla as possible" means here.

- **The keyless form works exactly as vanilla's**, because Nuxt's key
  injection is a module-extensible registry, not a hardcoded list (§5) — the
  module registers `useCheckedAsyncData` in `optimization.keyedComposables` and
  the compiler injects the key. **The lazy twin `useLazyCheckedAsyncData` is the
  same surface with `lazy` pre-set**, mirroring vanilla's own twin.

- **The runtime is unwrap-or-rethrow, and the carrier survives untouched.**
  The wrapper delegates to vanilla `useAsyncData` with
  `if (r.error) throw r.error; return r.data`. Measured (§5): Nuxt assigns
  `error.value = createError(error)`, and h3's `createError` short-circuits on
  its own errors — so the rethrown carrier lands in the error ref identical.
  `status`, `refresh`, `pending`, abort and dedupe are all vanilla's, because
  underneath it _is_ vanilla.

- **The matcher's typed overload became generic over the carrier** rather than
  the variant union, because a union of carriers — the multi-route handler —
  failed inference under the `E`-generic form. Measured as a strict widening:
  the entire pre-existing evidence passes unchanged. See §6.

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

`payload` and `fail` survive from the old package unchanged; what was
redesigned is the **glue** between defining an error and listing it on a
handler. The old catalogue was an opaque container resolved by tag —
module-private internals, a foreign-copy runtime guard, composition-order
rules. The new unit is the **variant as a value**; a group is nothing but an
array of those values.

- **`defineError` is one function for one or many.** `(tag, def)` returns a
  single `KnownError`; a defs record returns a `KnownErrorGroup` — an array
  of singles carrying `.pick()`. Arity separates the two overloads, so
  neither can win on shape (§6's standing rule).

- **The slot is an array of singles, and spread is the only composition
  operator.** `[...users, ...orders, forbidden]` — groups spread, singles sit
  in place, and the declared union is read off the element union by one
  distributing conditional. Four sibling glues were built alongside this one
  and rejected on comparison — see §4.

- **`.pick()` is permissive.** Any number of tags; repetition and emptiness
  absorbed rather than rejected — `K[number]` is a union and a union dedupes
  itself, so a tag picked twice _is_ the tag picked once. Only a tag the
  group never declared is a compile error. The uniqueness lives in the
  return: **standing runtime requirement — `pick()` and the handler's
  resolved errors list hold one error per distinct tag**, which also covers
  the JavaScript callers no type guard reaches. A compile-time uniqueness
  guard was built, measured, and deleted (§4).

- **Divergence, not repetition, is guarded.** The same tag declared again
  identically collapses when the union forms — no diagnostic, composition
  stays free. The same tag with a different status or payload survives as
  two union members sharing one discriminant, which breaks `fail`'s payload
  lookup and the matcher's arms alike — a genuine bug, so `ConflictGuard`
  (an `IsUnion`-per-tag pass, intersected FIRST per the old truncation
  lesson) reports it as a missing property naming the tag verbatim.

- **The handler carries its union out as `__knownErrors__?`** — an optional
  phantom, so a plain event handler still inhabits the type — and this brand
  is the only channel the emitter has: the generated map is derived from
  handler types, so without it the whole client surface reads `never`.
  `KnownErrorsOfHandler` reads it back, guarded so that both degradations —
  an unbranded handler and `any` — land on `never`, the honest "declares
  none". Measured findings behind the guard in §6.

- **The raise contract is structural.** `KnownRaiseInput` is what the
  implementation's raise may hand `createError`: `statusCode`, `message`,
  the marker under `data` — and `statusMessage?: never`, which turns step
  2's standing constraint into a compile error at the one place it could
  regress. `message` MAY carry the tag: the prod handler scrubs it on any
  escape (§5), so it only ever reaches the route's own client, which knows
  the tag already.

### Why the two surfaces read differently

`<script setup>` uses a bare `matchError(error, …)`; a function wraps it in
`if (error) { … return }`. That is the contexts differing, not the
design being inconsistent: **a top-level `return` in `<script setup>` is a hard
compile error** (§5). The composable cannot early-return and does not want to —
its `data` is a `Ref` handed to a template that copes with `undefined`
natively. A function can return, and wants to, because it goes on to use `data`
in the same scope.

|                     | can `return`? | shape                                           |
| ------------------- | ------------- | ----------------------------------------------- |
| `<script setup>`    | no            | `useCheckedFetch` + bare `matchError(error, …)` |
| inside any function | yes           | `$checkedFetch.try` + `if (error) { … return }` |

### Vocabulary — one word per concept

The old package spent three words on one idea: _handler-errors_ / _declared_ /
_typed_. "Known" wins because it is about the caller's situation and it comes
with its own antonym.

| Old                                | New                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `nuxt-handler-errors`              | unchanged — the rewrite replaces it in place; `nuxt-known-errors` is the design sandbox's placeholder only |
| `useDeclaredError`/`declaredError` | gone — `matchError` is the only read path                                                                  |
| `DeclaredErrorsOf`                 | `KnownErrorsOf`                                                                                            |
| `DeclaredErrorBody`                | `KnownErrorBody`                                                                                           |
| `__declaredError__`                | `__knownError__`                                                                                           |
| `__declaredErrors__` (handler)     | `__knownErrors__`                                                                                          |
| `defineErrors` + catalogue types   | `defineError` — one call for one or many                                                                   |
| `useTypedFetch` / `$typedFetch`    | `useCheckedFetch` / `$checkedFetch` — see the naming pass                                                  |

**failure** is the noun for the thing; **known / unknown** is the distinction;
**checked** is the modifier for the surfaces — a checked surface is one whose
failure path the compiler enforces. `error` stays Nuxt's word for the envelope.

### The naming pass — step 5's record

The whole surface was inventoried (~60 names across six stickiness tiers, from
wire keys down to parameter names) and settled in one sitting. The decisions,
each with its reason:

- **`checked` replaces `typed` as the surface modifier.** Two reasons. Honesty:
  vanilla `$fetch` is _already_ typed — its data channel has carried the
  route's response type all along, so "typed" claimed a distinction vanilla
  half-owns; what this package adds is a compiler-**checked** failure path
  (checked as in checked exceptions — handling the compiler forces). Migration:
  §2's own `safe` lesson — reusing a name while changing its contract migrates
  silently; a renamed surface forces migrators to read the new docs. The full
  family: `useCheckedFetch`, `useLazyCheckedFetch`, `useRequestCheckedFetch`,
  `$checkedFetch`, `event.$checkedFetch`, `useCheckedAsyncData`,
  `useLazyCheckedAsyncData`, `defineCheckedEventHandler`; types `CheckedFetch`
  (the seam), `$CheckedFetch`, `CheckedEventHandler`.

- **Word order of the twins: vanilla's modifier keeps vanilla's position,
  `Checked` stays glued to the noun it modifies** — `useLazyCheckedFetch`, not
  `useCheckedLazyFetch`. `useCheckedFetch` is the unit being mirrored, and
  vanilla's own convention puts _its_ modifier immediately after `use`
  (`useLazyFetch`, `useRequestFetch`). The alternative bought
  `useChecked…`-prefix autocomplete at the cost of breaking vanilla's
  word-order mirror; the mirror won.

- **`known` stays the word for failures, and the whole family is confirmed
  unchanged**: `KnownVariant`, `KnownError`, `KnownErrorGroup`,
  `KnownErrorBody`, `KnownErrorCarrier`, `KnownErrorsOf`,
  `KnownErrorsOfHandler`, `KnownRaiseInput`, the wire marker `__knownError__`
  and the handler brand `__knownErrors__`. Likewise `matchError`,
  `defineError`, `payload`, `fail`, `ConflictGuard` / `DivergentTags`, and the
  asyncData helpers `TrySource` / `SuccessOf` / `FailureOf`.

- **`.pick` stays.** Vanilla-adjacent precedent in this very package's options
  (`AsyncDataOptions.pick` subsets keys; this subsets tags — the same
  gesture), and the word's looseness matches the deliberately permissive
  semantics. `only` was the runner-up and not enough better to spend a
  divergence.

- **The fallback's second parameter is `unrecognized`.** The word is accurate
  for both producers (§3) — the call site fails to recognize it, whatever the
  reason. Spelling is American, per ecosystem convention (`normalize`,
  `serialize`); the British spelling was the only defect in the working name.

- **The fallback's error parameter stays `NuxtError`.** The client's word,
  structurally true of both runtimes (§5: every Nuxt-only member is optional,
  so an `H3Error` satisfies it). A package-owned alias would spend a new
  exported name to fix a cosmetic hover; the package's best feature is
  spending no novelty where vanilla has a word.

- **`status` is the one word for the status, on both layers.** The variant's
  wire floor says `status`, and Nuxt 4.5's `NuxtError` itself deprecates
  `statusCode` in favor of `status` / `statusText` — the two layers agree,
  and §2's `err.status ?? 0` was already the honest read. **Standing
  requirement for the implementation (roadmap 6): the server-side `.try`
  normalization must populate `status` on the carrier it hands out** — a bare
  `H3Error` sets only `statusCode`, and the `NuxtError` face must be
  runtime-true on both runtimes, not merely structurally satisfied.

- **The package takes back the old package's identity.** It ships as
  `@dphonys/nuxt-handler-errors`, module name `nuxt-handler-errors`, configKey
  `handlerErrors` — robbed from the package it replaces. `nuxt-known-errors`
  never publishes; it is the sandbox's placeholder. The generated-map
  interface (`KnownApiErrors` in the fixtures) and the emitter's virtual
  module id are step-6 items and follow the known vocabulary.

---

## 3. `unrecognized` is about deploys, not about you

Exhaustive arms fully cover "I forgot to handle a known error". The second
fallback parameter is a **different** case: the server is running a newer build
than the client, and sends a tag that did not exist when this bundle compiled.
No type system can catch that — the two artifacts compile separately.

Realistic trigger in a Nuxt app is narrow but real: **a tab left open across a
deploy.** Same-deploy SSR cannot hit it.

Worth keeping because it **fixes a documented unsoundness** in the old package,
rather than inheriting it. The old README:

> Under deploy skew, a tag the client does not know comes back **typed as a
> member it is not**, and reaches whatever fallback the caller wrote.
> `const _never: never = failure` stays compile-valid while being
> runtime-reachable.

With the matcher, an unrecognized tag cannot reach an arm — arms are keyed by
tags that were actually declared — so it lands in the fallback typed honestly as
the floor, `{ tag: string; status: number }`.

Step 2 gave the parameter a second producer. On a **degraded** call site — a
vanilla `useFetch`, a custom `useAsyncData` handler, a bare `catch` — there are
no typed arms at all, and the framework's `createError` copy still carries a
marker when one was thrown (§5). There it lands in the fallback the same way:
any marked variant, because the call site has no typed route knowledge to
recognize it against. So the parameter's one honest meaning across both
producers is "**known to the server, not to this call site**" — deploy skew on
a typed call, missing type knowledge on a degraded one.

Resolved in the naming pass (§2): **`unrecognized`**, American spelling. The
word is accurate for both producers; `skew` says _why_ for only one of them,
which argued against it, and `unknownTag` was tried and is actively misleading
— it reads as "you forgot one".

---

## 4. Rejected, with reasons

Do not re-propose these without new information.

| Direction                                                                                                          | Why not                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Relax "never touch vanilla"** — add `.safe` to `$fetch`, `failure` to `AsyncData`                                | **Technically blocked.** See §5. The shadow names are forced, not precious                                                                                                                                                                                                                                                                                                                                |
| **Result type** — no error channel, one `ok\|known\|crashed` union                                                 | Abandons Nuxt's `data`/`error`/`status` contract instead of extending it; nothing in the ecosystem composes with it                                                                                                                                                                                                                                                                                       |
| **Error classes + `instanceof`**                                                                                   | Errors must ship in the client bundle; no exhaustiveness; needs a runtime tag→class registry                                                                                                                                                                                                                                                                                                              |
| **Catalogue as the client matcher** (`userErrors.match(...)`)                                                      | Deletes the emitter, which is tempting — but the call site then knows the failures of whatever catalogue it _remembered to import_, not of the route                                                                                                                                                                                                                                                      |
| **Handlers as fetch options** (`known: { … }`)                                                                     | Handlers cannot return into the calling scope; re-fire on every refetch; nothing forces a call site to consider failure. Also largely reachable already via `onResponseError`                                                                                                                                                                                                                             |
| **Template-first** (per-tag refs, `<KnownError>` slots)                                                            | Slot names are untyped — `#user-nof-found` is silently a slot nobody renders. Also does not exist outside a component                                                                                                                                                                                                                                                                                     |
| **Guard + `matchError`** (`isKnownError(e)` then match)                                                            | Superseded — the matcher absorbs the guard, so `isKnownError` never needs to be public                                                                                                                                                                                                                                                                                                                    |
| **Type-level flattening** — a guard narrowing to `carrier & E` so `error.tag` works                                | Reads best of everything tried and is **false at runtime**: the variant lives at `err.data.data.__knownError__`. Was demoed as `variant4Unsound` and rejected deliberately                                                                                                                                                                                                                                |
| **`.safe` as it was** — declared failures as values, everything else thrown                                        | §1's root cause a second time: one concept split across a value channel and a throw channel by presence. Handling a route completely needed **both** a `try/catch` and an `if (!res.ok)`. Superseded by `.try`, which catches everything                                                                                                                                                                  |
| **`matchError` as a type predicate**, so `if (matchError(…)) return` narrows `data`                                | Measured: a user-declared predicate does **not** narrow a destructured sibling (§5), so the guard form would not have narrowed `data` either. All cost — the return value dies, and with it the expression form — for no gain. Recorded as `guardWouldNotHaveNarrowed` in `call-sites.ts`                                                                                                                 |
| **Restating the route in a `catch`** — `matchError<'/api/users/:id'>(e, …)`                                        | The §4 catalogue defect respelled: the call site would know the failures of whatever route it _remembered to type_, not the one it called. Change the URL in the `try` and the arms keep compiling about a different endpoint, with no backstop. Degrading to the floor is worse ergonomics that cannot lie                                                                                               |
| **Aggregating the arms' return types** so the matcher is an expression                                             | Locked, then overturned. There is nothing to aggregate: an arm handles a failure, and handling has no result. The union plus an unconditional `\| undefined` leaked into every util that wrote `return matchError(…)` — see §6. `void` costs `const message = matchError(…)`, recoverable by assigning to a ref inside the arms                                                                           |
| **An optional fallback that throws when absent**                                                                   | Would make the function's control-flow contract depend on argument count — the two-channels-by-presence defect for the third time. Worse here specifically: `.try` exists to end the throw channel. `(err) => { throw err }` is available, explicit and greppable                                                                                                                                         |
| **A route-parameter `useAsyncData` wrapper** (`useCheckedAsyncData<'/api/…'>(handler)`)                            | Rejection types do not exist in TypeScript, so a custom handler's throw cannot carry the union; a route type parameter is the route-restating defect again — the arms would describe whatever route was _typed_, not whatever the handler fetches. The locked `useCheckedAsyncData` (§2) is a different shape: no route parameter, the union inferred off the `.try` results the handler actually returns |
| **Exporting a body type for vanilla's `NuxtErrorDataT` generic** — `useAsyncData<T, KnownFetchError<'/api/…'>>(…)` | Measured working, and rejected as a second, worse spelling of the same thing: the generic is a manual assertion the compiler cannot check against the handler's fetches — the restating defect in vanilla clothing. With the return-channel `useCheckedAsyncData` locked, the honest inference path exists, so shipping a lying-capable twin buys nothing                                                 |
| **Record group into an object slot** — `errors: { ...users, forbidden }`, pick by destructuring                    | Glue proposal 1. Native syntax does everything, but the slot's keys are ignored — a key can lie about the tag under it — and object spread dedupes a colliding tag silently, last one wins, no diagnostic. The two silent failures outweigh the zero-API charm                                                                                                                                            |
| **Unified sets passed whole** — `errors: [users, orders]`, a single is a set of one                                | Glue proposal 3. One concept and no operator, but the set is opaque — no member is reachable as a value, so `.pick()` strings are the only subset door. The old catalogue's shape with less machinery, and the same distance from the values                                                                                                                                                              |
| **Record group with member access** — `errors: [users, forbidden]`, pick is `users['user-not-found']`              | Glue proposal 4. Language-checked picking (a typo is TS2339, no strings restated) is the strongest subset story, but the slot accepts two shapes and picking several members lists each one. Array+spread won on one element shape and one composition operator                                                                                                                                           |
| **The hybrid group** — array ∧ record ∧ `.pick()`, every style compiles                                            | Glue proposal 5. Flexibility measured as hazard: no spelling is canonical, hovers render a triple intersection, and the record half shares a namespace with `ReadonlyArray`'s members — a tag named `pick`, `map` or `length` intersects with a built-in instead of standing alone                                                                                                                        |
| **A compile-time unique-pick guard** — `K & UniquePickGuard<K>` rejecting a repeated tag                           | Built and measured (the `ConflictGuard` idiom ported to a rest position; readable diagnostic naming the tag), then deleted: repetition is a harmless redundancy the union dedupes for free, and the guard only ever yelled at TypeScript callers while a JavaScript caller sailed past. Uniqueness became the return's contract instead — one error per distinct tag, enforced at runtime (§2)            |
| **Mirroring the full `$CheckedFetch` on the event**                                                                | Nitro's own `event.$fetch` types `.raw` and `.create` it never assigns (§5). Copying the interface copies the lie; the event surface is the seam exactly, and `.create` has nothing to mean on an instance that _is_ the per-request customisation                                                                                                                                                        |

---

## 5. Verified facts about the framework

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

**Augmenting vanilla is blocked.** `$Fetch` _is_ an interface, but `ofetch`
does not declare it — it lives in `dist/shared/ofetch.<hash>.d.mts` and is
re-exported. A module augmentation merges only with an interface declared in the
module the specifier resolves to; a re-exported one is **shadowed**, silently.
The chunk name is a content hash, so there is no stable module to target.
`AsyncData` has the same shape. `globalThis.$fetch` is a `var` — a value
declaration, not augmentable at all.

**A top-level `return` in `<script setup>` is a compile error.** Measured by
running an SFC through @vue/compiler-sfc 3.5.40: `'return' outside of function`.
The block is parsed as a module body before it is spliced into the generated
`setup()`, so the `return` dies in the parser. Not a lint rule, not a footgun —
the component does not build. Top-level `await` is fine, which is why
`await useCheckedFetch(…)` works at all.

**Vanilla `$fetch` resolves to `TypedInternalResponse<R, T, M>`** — plain `T`,
no `null`, no wrapper (nitropack `dist/types/index.d.ts:130`). Contrast
`useFetch`, which is `data: Ref<DataT>` with `| undefined` baked into `DataT`
(nuxt `dist/app/composables/asyncData.d.ts:108`). The two surfaces genuinely
differ; `.try` follows `$fetch`.

**The variant's client-side path is `error.data.data.__knownError__`, and both
`data`s are the framework's.** Measured link by link: the server throw puts the
variant in `H3Error.data`; Nitro's default JSON handler serializes the body as
`{ error, url, statusCode, statusMessage, message, data: error.data }`
(nitropack `runtime/internal/error/prod.mjs:55-61`); ofetch's `FetchError.data`
is a getter over the parsed body (`response._data`); and `useAsyncData` wraps
the caught `FetchError` through h3's `createError`, which copies `input.data`
across (nuxt `asyncData.js:375`, h3 `dist/index.mjs:64`). So `error.data` is
the body and `error.data.data` is h3's data field. Flattening the wire means
replacing the Nitro handler and owning this section's first fact forever;
`matchError` being the only read path is what makes the depth cost nothing —
no call site ever spells it. Also measured, and load-bearing for the definition step (roadmap 4): the
prod handler sends `data: undefined` and `message: "Server Error"` when the
error is `unhandled` or `fatal`, so only a deliberate `createError` throw
carries a variant at all — an escaped plain `throw` loses its marker by
design of the framework, not of this package.

**The escape chain is measured link by link, and it scrubs the variant but not
the status line.** When handler A calls route B and B's failure escapes A: B's
response carries the variant in its JSON body and its status line as usual;
ofetch throws a `FetchError` whose `statusCode`/`statusMessage`/`data` are
getters over that response (`status`, `statusText`, parsed `_data` — ofetch
1.5.1 `createFetchError`); h3's listener catch wraps any non-`H3Error` through
`createError` — which copies `statusCode`, `statusMessage` and `data` across —
and sets `unhandled = true` (h3 `dist/index.mjs:2318-2321`); Nitro's prod
handler then treats `unhandled || fatal` as sensitive and sends
`message: "Server Error"`, `data: undefined` — but
`status = error.statusCode || 500` and `statusText = error.statusMessage`
pass through untouched (nitropack `runtime/internal/error/prod.mjs`). So the
callee's variant cannot reach the caller's client — the §3 unsoundness cannot
recur through server-to-server escapes — while the callee's status code and
reason phrase leak as the caller's own answer. The old package wrote
`statusMessage: tag` on the wire, which is exactly how its documented
reason-phrase leak happened.

**Nitro types `event.$fetch` as more than it assigns.** The type is
`Base$Fetch<unknown, NitroFetchRequest>` via a `declare module "h3"`
augmentation (nitropack `dist/types/index.d.ts:237`); the runtime assignment is
a bare arrow over `fetchWithEvent` (`runtime/internal/app.mjs:62`). `.raw`,
`.create` and `.native` exist in the type and not on the object — calling them
is a `TypeError` at runtime. Also `@experimental`, per Nitro's own doc comment;
the old package's first-call guard exists for that skew and stays right.

**`H3Event` _is_ augmentable — the one vanilla surface that is.** Unlike
ofetch's `$Fetch` and Nuxt's `AsyncData` (hashed chunks, shadowed silently),
h3 declares the `H3Event` class directly in its resolvable `dist/index.d.ts:29`.
Nitro ships exactly this augmentation for its own four per-request members, and
the old package's `declare module 'h3' { interface H3Event { $typedFetch } }`
shipped and held. Its caveat stands: an augmentation binds to a resolved path,
so a consumer with two physical h3 copies lands it on the one they are not
using — pinning h3 stays forbidden.

**The server-side carrier has the client's shape, made by the same copy.** An
`event.$fetch` failure is a `FetchError` whose `data` getter is the parsed
callee body; h3's `createError` copies `input.data` across. So a server `.try`
normalising through `createError` yields `error.data.data.__knownError__` at
exactly the client chain's depth, and one matcher serves both runtimes with no
adaptation. (Structurally, an `H3Error` also satisfies the `NuxtError`
interface — every Nuxt-only member is optional — which is why the sandbox can
reuse one carrier type; the naming pass (§2) kept Nuxt's name on both runtimes,
with the `status`-population standing requirement making the face runtime-true.)

**A carrier rethrown into `useAsyncData` lands in the error ref identical.**
Nuxt assigns `asyncData.error.value = createError(error)` on a handler
rejection (nuxt `asyncData.js:375`), and h3's `createError` short-circuits on
its own errors — `if (isError(input)) return input`, where `isError` checks
`input?.constructor?.__h3_error__ === true` (h3 `dist/index.mjs:140,68`). So a
handler that rethrows a `.try` carrier hands vanilla's machinery the exact
object the error ref will hold: no re-wrap, no depth change. This is what
makes `useCheckedAsyncData`'s runtime nothing but unwrap-or-rethrow.

**Nuxt's key injection is a module-extensible registry.** The keyless
`useAsyncData(handler)` form works because the compiler injects a key for
every function listed in `nuxt.options.optimization.keyedComposables` — an
array of `KeyedFunction { name, source, argumentLength }` (@nuxt/schema
`dist/index.d.mts:1559,3079`) that vanilla itself merely registers into, and
modules push onto. The injected key is appended as a trailing argument and
popped at runtime. Registering `useCheckedAsyncData` and its lazy twin there
gives the keyless form for free, as vanilla, no fork of the mechanism.

**Hydration preserves the marker.** AsyncData errors ride the payload as
`payload._errors[key]`, serialized by the `NuxtError` devalue reducer through
`H3Error.toJSON()` — which includes `data` whenever it is set (h3
`dist/index.mjs:50-61`) — and revived client-side through `createError(data)`,
which copies `data` across (nuxt `revive-payload.server.js:9`,
`revive-payload.client.js:17`). An error produced during SSR therefore reaches
the browser with `data.data.__knownError__` intact, and the matcher works on
hydrated errors unchanged.

**`useRequestFetch()` returns the bare event closure on the server.** The
implementation is three lines (nuxt `ssr.js:37-40`): the global `$fetch` on
the client, `useRequestEvent()?.$fetch || $fetch` on the server. So on the
server it hands back exactly the bare closure of the `event.$fetch` type-lie
above — the members beyond the call do not exist at runtime, and the seam is
the honest type for a typed mirror.

**A user-declared type predicate does not narrow a destructured sibling.**
Given `{ data: T; error: undefined } | { data: undefined; error: NuxtError }`,
`if (error) return` narrows `data` to `T`, but `if (isX(error)) return` does
not. TS's dependent-binding analysis runs off discriminant and truthiness
checks, not off predicates. This is what killed the guard-shaped matcher.

**TS1345 does not fire on `void | undefined`.** `if (f())` where `f` returns
`void` is an error; where it returns `void | undefined` it compiles and is
always falsy. Measured on TS 5.9.3. So `if (matchError(…))` is writable and
meaningless — a small attractive nuisance, and a second reason to keep the
matcher from looking like a guard.

**Nitro's error handler is a chain a module can join, and the builtin always
terminates it.** `nitro.options.errorHandler` accepts an array;
`resolveErrorOptions` (nitropack 2.13.4 `core/index.mjs:637-646`) normalises a
single value to one and **appends the builtin prod/dev handler last**. The
virtual `#nitro-internal-virtual/error-handler` runs the chain in order,
stopping when `event.handled`, passing each handler
`(error, event, { defaultHandler })` and swallowing a handler's own throw
(`rollup/index.mjs:1690-1703`). `defaultHandler` **returns**
`{ status, statusText, headers, body }` without sending — `body.data` is
`error.data` (`runtime/internal/error/prod.mjs`) — so a prepended handler can
render a modified body itself. Nuxt sets its own handler **only when the slot
is empty** (`@nuxt/nitro-server` `dist/index.mjs:513`) and calls the
`nitro:config` hook after that and before `createNitro` (lines 775/817), so a
module that prepends there while preserving existing entries composes with
both Nuxt's handler and a consumer's custom one. Measured live in the
playground: a prepended stripper answered a tokenless declared failure with
`data` gone and the status line intact, deferred a token-carrying request to
the builtin untouched, and left a foreign error's own `data`
(`/api/boom`) untouched. One dev-only wrinkle: the dev builtin's body carries
`stack`, so a stripper that spreads `res.body` forwards it — prod's does not.

**`captureError` fires the `error` hook before the error-handler chain runs.**
`onError` is `captureError(...)` then `errorHandler(error, event)`
(`runtime/internal/app.mjs:43-45`), so response-side stripping is
structurally invisible to observability. Measured live: the `error` hook
received the marker (`data.__declaredError__` present) on exactly the
requests whose responses went out stripped.

**The marker sits at two depths, and the recognizer must read both.**
Raise-site: the server's own thrown `H3Error` carries it at
`error.data.<marker>` — depth 1, and that is the shape the `error` hook sees
for a route's own declared failure. Fetched carrier: a server-to-server
failure carries it at `error.data.data.<marker>` — depth 2, measured
identical on the raw `FetchError` and after h3's `createError` (which wraps
the `FetchError` into a **new** `H3Error` — not the same instance, a
`FetchError` is no `H3Error` — while copying `data` across). An escaped
callee failure therefore reaches the hook at depth 2 with `unhandled` set,
which is the pair the observability recipe keys on.

The only route to vanilla spelling is **shadowing the auto-import**, which
costs: explicit `import { useFetch } from '#app'` bypasses it, the overload
mirror does not go away, type errors point into our wrapper, and installing the
module would change what `useFetch` does. For an open-source package that spends
the "nothing breaks" property, which is its best feature. **Not doing it.**

---

## 6. Type-level findings from the sandbox

Each of these compiled and looked correct while being wrong. This is the
argument for keeping the sandbox ahead of the implementation.

- **`NoInfer` breaks inside a mapped-type key.** `Arms<NoInfer<E>, R>` made the
  degraded call sites compile and silently turned _every_ arm parameter into
  `never` on the good path. The exhaustive form still type-checked — it just
  stopped narrowing payloads. Would have shipped.

- **An overload that can win on shape alone must not precede a more informative
  one.** On a degraded union `E['tag']` is `string`, so `Arms<E, R>` collapses to
  an index signature that matches almost any object literal.

- **The degraded overload must take `Record<string, never>` (i.e. `{}` only).**
  Its error parameter is `unknown`, so it is assignable from every call —
  including a typed one merely _missing an arm_. With any arms type a partial
  typed object could satisfy, it won on shape and **silently disabled
  exhaustiveness** (`@ts-expect-error` reported as unused). Capability given
  up: the degraded surface matches no tags and reads them off the fallback's
  second parameter.

- **A return type on the arms was the mistake, and it took two rounds to see
  it.** The full history, because the second round only makes sense given the
  first.

  _Round one._ With `arms: Arms<E, R>` every arm and the fallback had to agree
  on one inferred `R`. `void` is assignable from anything, so all-side-effect
  arms compiled and the signature looked correct for as long as nobody wrote
  arms that disagree. Two measured failures: a fallback like
  `() => navigateTo('/error')` pins `R` to `Promise<void>` and every `void` arm
  then fails **with the diagnostic on an arm**, blaming the wrong argument; and
  arms returning genuinely different value types missed the typed overload
  altogether, letting the degraded one report
  `Type '() => 404' is not assignable to type 'never'`. So "arms return values,
  so the call works as an expression" was only conditionally true — the original
  expression call site passed because all three of its arms happened to return
  `string`. Patched by inferring the arms object whole and unioning
  `ReturnType`.

  _Round two._ That patch works and is still the wrong shape. Aggregating the
  arms' returns makes the matcher's result a union of whatever the arms happened
  to do, and `| undefined` is welded on unconditionally because the error might
  be absent. Both leak into any function that writes `return matchError(…)`.
  Measured on a util:

  ```text
  async function getUser()                    // … if (error) return matchError(…)
    inferred: Promise<void | User>

  async function getUser(): Promise<User | null>
    error: Type 'null | undefined' is not assignable to type 'User | null'
  ```

  A conditional `| undefined` fixes the second — and the naive
  single-signature attempt at it silently destroyed `E` inference, collapsing
  every arm to `KnownVariant` while still compiling, which is this section's
  lesson yet again. But the honest reading is that **there was nothing to
  aggregate**: an arm handles a failure, and handling has no result. Fixing the
  arms' return to `void` deletes the round-one bug rather than patching it —
  with no inferred `R`, nothing can pin anything — and turns
  `return matchError(…)` in a value-returning function into the compile error it
  should always have been.

- **An overload generic over `E` fails on a union of carriers.** With
  `<E>(error: KnownErrorCarrier<E>, arms: Arms<E>, …)`, a multi-route error —
  `NuxtError<BodyA> | NuxtError<BodyB>`, exactly what a two-fetch
  `useCheckedAsyncData` handler produces — inferred `E` from one member only and
  rejected the whole call. Inferring the carrier itself and extracting the
  union with a naked conditional (`VariantOf<C> = C extends
KnownErrorCarrier<infer E> ? E : never`, which distributes) accepts the
  union and keeps every prior property: measured as a strict widening, with
  the entire pre-existing `call-sites.ts` passing unchanged. A side benefit:
  `E` has no inference site at all any more, so the arms argument can never
  pin anything — the `NoInfer` class of bug loses its foothold.

- **An optional phantom brand on a VALUE is a weak type every object
  matches.** `KnownError` with `[VARIANT]?: E` would let any extraction
  conditional (`T extends KnownError<infer E>`) match records, arrays and
  garbage alike, inferring `unknown` and silently poisoning the slot's
  union. The brand on values is therefore **required** — the implementation
  attaches a marker or casts, as the old catalogue did. The brand on the
  **handler** stays optional deliberately (a plain `EventHandler` must
  inhabit `CheckedEventHandler`), which is safe only because the extractor is
  the single reader and it guards.

- **An unbranded function matched against `{ __knownErrors__?: infer E }`
  infers `E = undefined`, not `unknown`.** So `Exclude<E, undefined>` is the
  entire unbranded guard — the old package's spelling, now measured rather
  than trusted. An `unknown extends E` belt was added on top and measured
  dead: this position never produces `unknown`. `IsAny` is still required
  and separate — `any` matches everything with `E` unresolved.

- **`@ts-expect-error` anchors on the arms argument** — when the error argument
  is well-typed and only the arms are wrong. When the error argument is
  `unknown` (a `catch`), _both_ overloads fail and the diagnostic is a
  whole-call `TS2769`, so the directive has to sit above the call expression
  instead. Both placements are load-bearing and neither generalises; the two
  live side by side in `call-sites.ts`.

---

## 7. The internals step — requirements, stated

Roadmap step 6's promised moment: the requirements for the implementation,
settled in discussion on top of the old package's internals inventory
(`INTERNALS-ANALYSIS.md`, the per-piece take / adapt / drop verdicts — the
emitter and wiring schedule carry nearly whole; the catalogue runtime carries
as ideas; `statusMessage: tag` and `.safe`'s rethrow semantics are dead).

### Payload schemas — standardSchema, inference-only

The payload position accepts a Standard Schema (`zod`, `valibot`, anything
carrying `~standard`) as an alternative to `payload<T>()`, which stays as the
no-library door. The payload type is read via `InferOutput`; the
serializability constraint applies to the inferred output exactly as it does
to the phantom's argument. **The schema is never executed by this package** —
decided deliberately, not deferred: client-side execution would need the defs
at the call site (the rejected catalogue-as-matcher defect), raise-site
execution poses the error-while-erroring problem, and the planned validation
package is the natural owner of runtime checking. `@standard-schema/spec` is
types-only, so the dependency costs nothing at runtime. The emitter,
`ConflictGuard` and the brand are untouched — they consume the payload
*type*, however it was obtained.

### Channel gating — strip the marker for callers that are not the app

A token, set by the consumer (runtimeConfig/env), that every fetch surface of
this package attaches as a custom `x-` request header — the same
attach-a-header machinery as the load-bearing `accept` merge, in all three
merge forms. Server-side, a response to a request without the token has the
marker **stripped at serialization**: third parties calling the API directly
get an ordinary error response; the app's own calls (which always carry the
header, browser and SSR alike) get the full wire.

- **The thrown error always carries the marker; only the serialized response
  is ever stripped.** This is the Sentry-stability requirement: observability
  sees tags on every known failure or on none, never depending on who
  called. Raise-site stripping was considered and rejected for exactly that
  inconsistency.
- **The token is a channel tag, not a secret.** It ships in the client
  bundle and is visible in devtools; it marks first-party intent and stops
  casual consumers, and the docs must frame it as that, never as
  authentication. Accepted deliberately.
- Enabled by the token's presence; absent means today's behavior. No
  `ModuleOptions` entry needed.
- **The stripping seam is measured and holds** (§5): the module prepends an
  entry to Nitro's `errorHandler` array at `nitro:config`, preserving
  existing entries — composing with Nuxt's handler and a consumer's custom
  one alike, with the builtin always appended last as the fallback. The
  prepended handler renders `defaultHandler`'s body with the marker stripped
  for tokenless marked requests and defers otherwise; foreign errors pass
  untouched. Owning `nitro.errorHandler` wholesale stays off the table — and
  is no longer needed. The hook ordering (`captureError` before the chain)
  makes the Sentry-stability rule structural, confirmed live.

### Core / module layering — structure now, extraction later

The package is built in two layers from the first commit: a **core** (wire,
raise path, matcher runtime, definition surface, recognizer) that imports
nothing from `@nuxt/kit`, `#app`, or the Nitro runtime, and a **module**
layer (plugins, composables, emitter wiring) consuming it. The planned
sibling packages — params/body validation, OpenAPI generation — and the
umbrella module that composes all three are why the boundary exists; the
**extraction into published packages waits until the second consumer is
real**. That order is the §2 barrel lesson applied: the handler-composition
seam (one definer carrying errors *and* validation) is the hard design
problem, and it gets designed against two real consumers with veto power,
not one real and one imagined. Noted for then: the OpenAPI package needs
schema *values* at build time — a different channel than the type map, whose
never-catalogue-content rule is unchanged — and a shared core makes the
foreign-copy runtime guard more load-bearing, not less.

### Observability — a recognizer, and the integration decides

Nitro's `captureError` fires the `error` hook unconditionally and the fan-out
has no cancellation, so the module suppresses nothing and never will. What it
ships is a server-side **recognizer** over the wire floor — the variant or
`undefined` — handling **both marker depths** (`data.__knownError__` on the
server's own thrown error, `data.data.__knownError__` on a fetched carrier),
plus the documented recipe: filter in Sentry's `beforeSend` or the consumer's
own `error` hook, keyed on the recognizer **and** `unhandled === false` — so
a route's own declared failure is filterable while an escaped callee failure
still reports as the caller bug it is. Both depths are measured (§5): the
hook sees depth 1 for a route's own raise and depth 2 (with `unhandled`) for
an escaped callee failure — the two shapes are exactly the two cases the
recipe distinguishes. Whether known failures appear in
Sentry is the integration's one-line choice, made once, stable by the
always-marked rule above.

### The old open questions, dispositioned

- **Observability** — resolved above.
- **The foreign wire marker on the degraded reader** — accepted and
  documented for v1: a forged marker is no worse than a forged success
  payload, and the degraded fallback types only the floor. Revisitable
  compatibly.
- **The catalogue-driven skew-safe match helper** — out of v1, recorded as
  future work; the `unrecognized` fallback already handles skew honestly.

---

## 8. Roadmap

1. ~~Lock the client call sites~~ — done, §2: `useCheckedFetch`, `$checkedFetch`,
   `$checkedFetch.try`, and the bare-`catch` floor. Completed after step 3 by a
   sweep of Nuxt's exported surface: `useLazyCheckedFetch`,
   `useRequestCheckedFetch`, `.native` (§2, "The remaining vanilla mirrors") —
   and the measured fact that hydration preserves the marker (§5)
2. ~~Lock the server-side call sites~~ — done, §2: `event.$checkedFetch` is the
   seam exactly, handlers translate through `.try` + throwing arms, `shared/`
   accepts the seam, a throwing `useAsyncData` handler degrades honestly. The
   old "prefer `.safe` server-to-server" question resolved to a measured rule:
   an escape cannot smuggle the variant (the framework scrubs it, §5) but
   answers with the callee's status line, so `.try` + translation is the only
   shape written
3. ~~Lock the asyncData surface~~ — done, §2: `useCheckedAsyncData` and its lazy
   twin, handlers returning `.try` results, repositories as the expected
   common case, vanilla's own options over the unwrapped success, the keyless
   form via `keyedComposables` (§5). Carried the matcher to a carrier-generic
   typed overload so multi-route unions infer (§6)
4. ~~Lock the error definition and the handler~~ — done, §2 ("The definition
   surface"): variants as values via one `defineError` (one or many by
   arity), groups as spreadable arrays with a permissive `.pick()`,
   divergence-only `ConflictGuard`, the `__knownErrors__` brand with its
   guarded extractor, and `KnownRaiseInput` making the `statusMessage`
   constraint structural. `payload` and `fail` carried over unchanged. Five
   glue shapes were compared in-sandbox; the four losers and the deleted
   unique-pick guard are §4 rows. Evidence lives in `sandbox/glue/`
5. ~~Naming pass over the whole surface~~ — done, §2 ("The naming pass"): the
   whole surface inventoried by stickiness tier, `checked` replacing `typed`
   on every surface name, the twins keeping vanilla's word order, the `known`
   family / `defineError` / `.pick` / the helpers confirmed unchanged,
   `unrecognized` (Americanized) as the fallback's second parameter,
   `NuxtError` + `status` as the one answer on both layers (with the
   server-normalization standing requirement), and the package taking back
   `nuxt-handler-errors`'s name, module name, and `handlerErrors` configKey
6. **Then the internals** — emitter, wire, runtime. The standing requirements
   are stated: §7 (payload schemas inference-only, channel gating stripped at
   serialization, core/module layering with deferred extraction, the
   observability recognizer), on top of the take / adapt / drop inventory in
   `INTERNALS-ANALYSIS.md`. Both pre-implementation measurements are done
   and recorded in §5: the `errorHandler`-chain stripping seam holds (array
   slot, prepend at `nitro:config`, `defaultHandler` returns without
   sending, hook-before-chain ordering), and the recognizer's two marker
   depths are confirmed live

Nothing at all is implemented; the design and its measurements are complete,
and implementation can start.
