# `@dphonys/nuxt-handler-errors` — design spec

**Status:** implemented, and amended in place. Nothing here is a
proposal; every decision below was resolved on a ticket of the
[Nuxt typed endpoint results](../../.scratch/nuxt-typed-endpoint-results/map.md) map, and every claim marked *measured* was compiled or
executed against a real Nuxt 4.5.1 / h3 1.15.11 / nitropack 2.13.4 / ofetch 1.5.1 install.

> **What the implementation effort changed here, and how to read it.** Fifteen tickets built this
> surface and measured **fifty-four** places where a claim below did not survive contact. Each is
> corrected in place, in this document's own voice, with the number that replaced it — a correction
> reads *"the spec recorded X; measured, Y"* rather than deleting X. **No decision was reversed by
> the implementation effort.** Every correction is a mechanism, a number, a spelling or a
> reachability claim; §11's rejections and §12's open questions are untouched by them. Amended
> paragraphs are marked **⟳ Measured in implementation**. The one structural change is §9.1, which
> now has five layers rather than four.

**This document decides nothing new.** Where it records an open question it does so explicitly, in
[§12 Inherited fog](#12-inherited-fog--open-questions-the-map-deliberately-left). An implementer
should treat anything *not* in §12 as settled, and anything in
[§11 What was ruled out](#11-what-was-ruled-out-and-why) as already re-proposed and already
rejected.

**Provenance.** Section headings cite the ticket that owns the decision, e.g. *(07 §3)* means
ticket 07's answer, section 3.

> **Where the cited sources live, and their durability.** This spec is the only tracked artifact of
> the effort that produced it. The map, the 20 ticket files (`issues/NN-*.md`) and the six probe
> directories all live under `.scratch/nuxt-typed-endpoint-results/`, **which is gitignored** — the
> relative links below resolve in the working tree that produced this document and nowhere else. See
> [§13 Evidence index](#13-evidence-index) for what each probe proves, and for the one artifact that
> is more fragile still: the ticket-09 prototype's second copy is a local `git stash`.

---

## 1. The contract, in one page

An endpoint declares the failures it can produce, once, in the route file. Every consumption site
recovers both the success type **and** that declared failure union from the route path alone.

### What the endpoint author writes

```ts
// shared/errors/auth.ts — a catalogue, reusable across routes
import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/shared'

export const authErrors = defineErrors({
  'unauthorized': { status: 401 },
  'forbidden': { status: 403, payload: payload<{ requiredRole: 'admin' | 'owner' }>() },
  'token-expired': { status: 401, payload: payload<{ expiredAt: string }>() },
})

// server/api/users/[id].get.ts
export default defineTypedEventHandler(
  { errors: [authErrors.pick('forbidden', 'unauthorized'), userErrors] },
  async (event, { fail }) => {
    const id = getRouterParam(event, 'id')!
    const user = await useDb().users.find(id)
    if (!user) return fail('user-not-found', { userId: id })
    if (!canRead(event, user)) return fail('forbidden', { requiredRole: 'owner' })
    return user                       // success type: User. No annotation anywhere.
  },
)
```

- The success type still infers from the body, exactly as a plain `defineEventHandler` does —
  `fail` returns `never`, so `return fail(…)` contributes nothing to the inferred return type.
- `fail('not-a-declared-tag')` is `TS2345`, with completions listing exactly the declared tags.
- Nitro's own `InternalApi` entry for this route is untouched: vanilla `useFetch('/api/users/1')`
  still types `data` as `User` and `error` as `NuxtError<unknown>`, unchanged and unpolluted.

### What the consumer gets

```ts
const { data, error } = await useTypedFetch('/api/users/123')
//      ^? Ref<User | undefined>        ^? Ref<NuxtError<…> | undefined>

const failure = declaredError(error.value)
//    ^? { tag: 'user-not-found', status: 404, userId: string }
//     | { tag: 'user-suspended', status: 403, until: string }
//     | { tag: 'forbidden', status: 403, requiredRole: 'admin' | 'owner' }
//     | { tag: 'unauthorized', status: 401 }
//     | undefined

if (failure?.tag === 'user-suspended') showBlocked(failure.until)
```

and imperatively:

```ts
const r = await $typedFetch.safe('/api/users/123')
if (!r.ok) {
  switch (r.error.tag) {
    case 'user-not-found': return notFound(r.error.userId)
    case 'forbidden': return denied(r.error.requiredRole)
    default: { const _never: never = r.error; return _never }
  }
}
use(r.data)
```

### The three sentences the whole design rests on

1. **The declared union never enters the handler's return type.** It rides a phantom brand on the
   handler's *type*, recovered by a generated parallel `.d.ts` keyed by the same route strings
   Nitro uses. `ReturnType` reads only the call signature; the brand is a sibling property. Disjoint
   positions — the leak is structurally impossible, not merely avoided (01a).
2. **On the wire, a declared failure is an ordinary HTTP error carrying one reserved key.**
   `data.__declaredError__ = { ...payload, tag, status }`. Its presence *is* the evidence that the
   server declared this failure; its value *is* the variant (08).
3. **Graceful degradation to vanilla is a lock.** On a route that declares nothing, every wrapper is
   indistinguishable from its vanilla counterpart — same accepted argument types, same completions,
   same error channel. An undeclared route is never a compile error (06 §1).

If this page does not make the idea obvious, that is a defect in this page, not in the design.

---

## 2. Vocabulary

| Term | Meaning |
| --- | --- |
| **Variant** | One declared failure: `{ ...payload, tag, status }` — reserved keys last, see §5.1. Tag is the discriminant; status never participates in narrowing. |
| **Catalogue** | A named, reusable set of variants — the product of `defineErrors({…})`. A real runtime value. |
| **Declared union** | The union of every variant a route listed in `errors: [...]`. Exactly what the route published. |
| **Declared failure** | A failure that carries the wire marker. Recognisable at runtime; typed at compile time. |
| **Undeclared failure** | Everything else — 500s, network drops, framework errors, routes that opted out. Behaves exactly as it does today. |
| **The map** | The generated `TypedApiErrors` interface: route → method → declared union. Type-level only. |
| **The brand** | `__declaredErrors__?`, the optional phantom property on `TypedEventHandler`. |

Naming split, locked in 10 §6 and upheld by 11 §8: **`typed` names the call**
(`defineTypedEventHandler`, `useTypedFetch`, `$typedFetch`); **`declared` names the thing read**
(`declaredError`, `DeclaredErrorsOf`, `DeclaredErrorBody`, `__declaredError__`).

---

## 3. Public API surface

Three specifiers, fixed by 15 §3. The set is forced, not preferred: 06 plus 07/12 require
`TypedApiErrors`, `ErrorCatalogue`, `VariantsOf` and `Payload` reachable from **one** specifier that
resolves from client, server *and* the consumer's `shared/` directory.

| Specifier | Holds |
| --- | --- |
| `.` | the Nuxt module itself. **Import-protected by Nuxt** in every context including `shared` (`nuxt/dist/index.mjs:5048-5052`), so it is never hand-written — which is why subpaths are mandatory, not stylistic. |
| `/types` | 06's augmentation target *and* the whole public type surface: `TypedApiErrors`, `DeclaredErrorsOf`, `ErrorCatalogue`, `VariantsOf`, `Payload`, `DeclaredErrorBody`, `TypedEventHandler`. Follows `nitropack/types`' own precedent of one specifier in both roles. |
| `/shared` | side-agnostic runtime values: `defineErrors`, `payload`, `declaredError`, `DECLARED_ERROR_KEY`, `invalidInput`. |

**Auto-imports are additive sugar, never the contract.** `shared/` auto-imports exist but only for
symbols registered in **both** unimport contexts with an identical `from`
(`nuxt/dist/index.mjs:3849-3862`) — silent and conditional. A hand-writable specifier is the
contract (15 §3). App-side, `useTypedFetch` / `useLazyTypedFetch` / `declaredError` /
`useDeclaredError` are additionally auto-imported.

> **⟳ Measured in implementation — the sugar rule has exactly one exception, and it is forced.**
> `useTypedFetch` / `useLazyTypedFetch` call `useFetch`, which lives behind `#app` — an alias that
> exists in the **app** build only. None of the three specifiers above may carry that import: `.` is
> import-protected, `/types` is type-only, and `/shared` is loaded by Nitro in a real production
> build (measured — §3.7's readers ride it). So for those two names the `addImports` registration
> **is** the whole contract; they ship as a published *file*
> (`dist/runtime/app/use-typed-fetch.js`), not a published *specifier*, and a call site that wants
> the import written out reaches for Nuxt's own `#imports`, which is Nuxt's contract for exactly
> this. **No fourth `exports` entry was added and none would help** — it would resolve from the
> server and `shared/` contexts too, where it cannot work.
>
> `$typedFetch` (§3.5) is not an auto-import at all: it is a genuine `globalThis` property, declared
> the way Nitro declares `$fetch`. See §3.5.

### 3.1 Server: `defineTypedEventHandler` (07, 13)

```ts
defineTypedEventHandler(
  options: {
    errors: readonly ErrorCatalogue<any>[]
    body?:   StandardSchemaV1     // optional, see §3.3
    query?:  StandardSchemaV1
    params?: StandardSchemaV1
  },
  handler: (event: H3Event, ctx: {
    fail: (tag, ...payload) => never
    body:   InferOutput<typeof options.body>     // present only if declared
    query:  InferOutput<typeof options.query>
    params: InferOutput<typeof options.params>
  }) => Response,
): TypedEventHandler<…>
```

Shape rules, all compile-verified:

- **Options object first, handler last** (07 §1). Chosen over h3's single-object `EventHandlerObject`
  form so the declaration sits visibly at the top of the route file and future options land in the
  existing object without a third positional parameter.
- **No writable explicit type parameter.** `Response` is declared with **no default type
  parameter**, so supplying any explicit type argument is a `TS2558` arity error — not a silent
  collapse to `any`. This is strictly stronger than 01a's original "never expose a leading explicit
  type parameter" mandate, and **replaces** it: the trap is unrepresentable, not merely discouraged
  (07 §1, `neg/n4`).

  > **⟳ Measured in implementation — the number in the message is `2-6`, not `2-3`, and it moves
  > again.** §3.3's schemas ride the same options object with no signature change, but their
  > *outputs* have to be inferred somewhere: `Body`, `Query` and `Params` ship as defaulted type
  > parameters appended **after** `Request`, each `extends StandardSchemaV1 | undefined = undefined`.
  > That is the entire cost of §3.3's "no signature change", and the day a fourth typed option lands
  > the number moves again. The **mandate** is untouched and still asserted — `Response` has no
  > default, so one explicit type argument is an arity error rather than a silent `any`. Anything
  > quoting the message should quote it from `test/types/declare-and-raise.test.ts`, not from here.
- **`fail` is scoped to the declared union and returns `never`.** It throws at runtime. `return` is
  idiomatic rather than required, but makes the exit obvious and sidesteps every control-flow-analysis
  edge case. Payload arguments are **variadic**, so a payload-less variant takes no second argument
  and passing one is an error (`neg/n6`, `neg/n7`).
- **The success type infers with no annotation** (07 §5, measured):
  `InternalApi['/api/users/:id']['get']` computed through the real
  `Simplify<Serialize<Awaited<ReturnType<…>>>>` chain equals the handler's return shape exactly, and
  `const asPlain: EventHandler = handler` compiles — Nitro, the router and every h3 utility keep
  treating the route as an ordinary handler.
- **The Result type from ticket 04 appears nowhere in the signature.** It is at most an internal
  implementation detail of the boundary conversion (07 §6).

### 3.2 Server: `defineErrors` and `payload` (12)

```ts
defineErrors<const D extends Record<string, { status: ErrorStatus, payload?: Payload<any> }>>(
  d: D
): ErrorCatalogue<VariantsOf<D>>

// on the returned catalogue:
.pick<const K extends readonly E['tag'][]>(...tags: K): ErrorCatalogue<Extract<E, { tag: K[number] }>>
.raise(tag, ...payload): never          // documented, UNENFORCED escape hatch — see §6.3

payload<T>(): Payload<T>                // phantom marker; `{} as T` with a name
```

- **Status is inline and has no default** (07 §2). A defaulted 400 makes a variant's status invisible
  where it is declared and quietly turns 404/409/403 into 400s, against the "declared failures remain
  correct HTTP citizens" lock. `{ status: 401 }` is twelve characters. `status` is typed
  `ErrorStatus` — the common 4xx/5xx literals unioned with `(number & {})` — so it gets completions
  and reads wrong when it is wrong, without closing the set.
- **Payload literal types survive.** `const D` preserves `status: 404` as `404`, and
  `payload<{ requiredRole: 'admin' | 'owner' }>()` round-trips its union intact through the generated
  map (measured).
- **`payload<T>()` rejects fields that do not survive `Serialize`** (08 §5), surfaced as a
  missing-property message naming the field. This is a hard requirement, not hygiene: `bigint` does
  not merely vanish from the client's type, it makes `JSON.stringify` **throw** inside Nitro's
  serializer, converting a declared 403 into a genuine unhandled 500. `unknown` and `void` map to
  `never` silently. `Date` → `string` is fine and must not be rejected. Because `payload<T>()` takes
  an **explicit** type argument fully resolved at the call site, this check never sits in the
  deferred-generic position §10 discusses.
- **Composition is a homogeneous array of catalogue values**: `errors: [authErrors.pick('forbidden'),
  userErrors]`. Homogeneity keeps the merge type to one indexed access.
- **Duplicate tags across composed catalogues are a compile error**, checked flat — one distributive
  pass, no tuple recursion, so it stays out of the deferred-generic position (12 §2):

  ```ts
  type IsUnion<T, U = T> = T extends any ? ([U] extends [T] ? false : true) : never
  type DuplicateTags<E extends AnyVariant> = {
    [K in E['tag']]: IsUnion<Extract<E, { tag: K }>> extends true ? K : never
  }[E['tag']]
  ```

  Two catalogues declaring an *identical* member are correctly **not** flagged — the members collapse
  to one union member, `IsUnion` is false, composition compiles clean (`neg/n3`). Only a genuine
  divergence in status or payload trips it.
- **The guard must be intersected FIRST — `ConflictGuard<C> & { errors: C }`, never the reverse.**
  A measured usability mandate: TypeScript truncates the *tail* of a rendered type, and
  `ErrorCatalogue<VariantsOf<{…}>>` is long enough to bury the message. Guard-last detects the
  conflict but renders `… & { ......'` and the developer never learns which tag collided. Surfacing
  it as a **missing required property whose type is a template literal** is what puts the tag in the
  message at all; a plain branded `TagConflict<T>` marker renders as `TagConflict<...>` and says
  nothing. This mandate is under test — see §9.2.
- **Partial selection via `.pick()` is about honesty, not convenience** (12 §3). A route listing an
  eight-variant catalogue it can only produce two of has published a contract for six failures it
  will never emit. Over-declaring breaks the destination as surely as under-declaring. `.pick()` of
  an unknown tag is `TS2345` listing the real tags (`neg/n8`).
- **Location-agnostic, `shared/` documented as the default.** The module never looks at where a
  catalogue lives because it never needs to — the union travels via the brand, so client narrowing
  works identically for a catalogue in `server/`, and a mandate would be unenforceable at every level
  (type, build, runtime). `shared/` is the documented default on this argument: a `server/` catalogue
  is unreachable from client code, so any future client-side *runtime* use of the catalogue value
  (a `match`/`is` helper, a tag→copy map) requires a file move touching every import — while a
  `shared/` catalogue imported only by server code is tree-shaken out of the client bundle entirely.
  Keeping the option genuinely costs nothing. (12 §4, on its post-08 replacement argument.)

### 3.3 Server: validation (13)

Schemas ride the **same options object** as `errors` — no signature change, no third positional
parameter, and 07 §1's `TS2558` protection is untouched.

```ts
// server/api/users.post.ts
import { defineTypedEventHandler, invalidInput } from '@dphonys/nuxt-handler-errors/shared'

export default defineTypedEventHandler(
  {
    errors: [authErrors.pick('unauthorized'), invalidInput],
    body: CreateUser,        // a raw Standard Schema value — z.object(…), v.object(…), …
    query: Paging,
  },
  async (event, { fail, body, query }) => {
    //                     ^ CreateUser's output  ^ Paging's output — both already parsed
    if (!session(event)) return fail('unauthorized')
    return db.users.create(body)
  },
)
```

The module ships **one plain catalogue value**, `invalidInput`, tag `'invalid-input'`, status 400.
It is an ordinary `defineErrors` product: it composes, it is subject to the duplicate-tag guard, it
has `.pick()` (vacuously) and `.raise()`. **It is never implicitly present.**

The variant's shape:

```ts
{ tag: 'invalid-input'
  status: 400
  issues: ValidationIssue[] }

interface ValidationIssue {          // MUST be a named interface — see §8.3
  location: 'body' | 'query' | 'params'
  path: (string | number)[]
  message: string
}
```

Decisions inside this surface:

- **The module owns validation; it does not adapt h3's.** h3 1.15.11 throws the raw exception as
  `data`, which serializes to `{name, message}` — nothing machine-readable reaches the client (05).
  Owning it makes both of h3's live footguns **unrepresentable**, and inverts the second:
  `body: CreateUser.safeParse` — h3's own JSDoc-recommended spelling, which there *silently disables
  validation* — is `TS2322` (a function has no `~standard`), while `body: CreateUser`, the raw schema
  object h3 crashes on, is the **correct** argument here.
- **Standard Schema, inlined (~50 lines), zero runtime dependencies.** The spec types are inlined
  exactly as h3 v2 does rather than depending on `@standard-schema/spec`. zod, valibot and arktype
  work untouched. `~standard.validate` carries a `Promise` arm even for a synchronous zod object
  schema, so the adapter always awaits — invisible to the author, whose handler is already async.

  > **⟳ Measured in implementation — the claim is run, and the dependency lands where it should.**
  > zod is a **devDependency of the package** (its tests) and a **dependency of the playground** (one
  > route). The module's own `dependencies` are unchanged and `dist/` imports no validator, so
  > *"inlined, ~50 lines, zero runtime dependencies"* holds literally. The layer-1 fixtures
  > deliberately use a hand-rolled schema instead, so every *type-level* claim is made in a program
  > with no validator in it at all.
- **No plain-`(v: unknown) => T` escape hatch** (`neg/n2`): accepting one reopens the `safeParse`
  hole verbatim, since a `safeParse` reference is exactly that shape. Consumers whose validator
  predates Standard Schema wrap it themselves; the module offers no adapter and the docs say so.
- **One merged variant, not one per location.** Per-location tags would force every route to keep a
  `.pick()` list in agreement with its schema keys with nothing checking it. `location` sits on the
  *issue*, so every declared location is validated and one response reports everything wrong at once.
- **Issues stay loosely typed. This was the hard call, decided against typed paths with eyes open**
  (13 §4). Standard Schema exposes no AST, so literal-union paths mean a recursive `PathsOf<Input>`
  which (a) forces a catalogue factory, (b) lands recursion in the deferred-generic position and ships
  **unevaluated** into the emitted `.d.ts` and 06's map — where hover legibility is a mandatory
  declaration-shape property — and (c) degrades to `string` for `z.record`, `z.union`, recursive
  schemas and array-of-object, i.e. precisely the schemas that need it most. It is a **floor, not a
  ceiling**: a factory export is purely additive later.
- **`path` is a segment array, not a dotted string.** Lossless, mirrors the spec's own model,
  survives `Serialize` unchanged; the dotted form is one `.join('.')` at the call site. A whole-value
  issue is `path: []`. Re-exporting Standard Schema's own `Issue` was **never available**: `Issue.path`
  is `ReadonlyArray<PropertyKey | PathSegment>` and `PropertyKey` includes `symbol`, so through
  `Serialize` it becomes `(string | number | { readonly key: string | number } | null)[]`.
  Normalisation was mandatory, not preferred.
- **⟳ Measured in implementation — a location always ends the pass with a parsed value *or* at least
  one issue, never neither.** A Standard Schema result is a failure by the *presence* of `issues`,
  and nothing in the spec's types forbids that array being **empty**. Read literally, such a result
  reports nothing wrong: `issues.length > 0` is false, the definer proceeds, and the handler runs
  with `body` **undefined** behind a type that says *"already parsed"* — a `TypeError` in the
  handler's first line, from a request that was rejected. Shipped is that invariant, stated where it
  is enforced: a location that produced neither gets a synthesized whole-value issue (`path: []`).
  Mutation-proved in `test/validation.test.ts`, in both spellings (`issues: []`, and an `issues` that
  is not a list at all).
- **⟳ Measured in implementation — a source that cannot be *read* is an issue at that location, not a
  throw, and it masks h3's 405.** §3.3 as written describes what happens when a value fails its
  schema and says nothing about a value that never arrived. Shipped is a `catch` around the read that
  turns it into `{ location, path: [], message: "The request body could not be read." }`. The
  argument is the one-channel rule: without it a body of the wrong *shape* is a **declared** failure
  while a body that is not JSON at all is an **undeclared** one — the same caller mistake reported
  through two different channels, which is exactly the h3 defect this surface exists to fix. *The
  cost, stated rather than hidden:* `readBody` on a method h3 refuses a body for throws
  `405 Method Not Allowed`, and through this arm the caller sees this module's 400 instead. That case
  is a *route author's* mistake — declaring `body` on a route that cannot have one — rather than a
  caller's, which is why the trade goes this way. Both the malformed-JSON case and the 405 masking
  are under test in `test/validation.test.ts`, the latter explicitly so it cannot change silently.
- **⟳ Measured in implementation — the normalisation is defensive, because `issue.path` is
  third-party data.** §3.3's normalisation paragraph reads as arithmetic over a trusted shape and it
  is not one: the adapter is handed whatever a *consumer's* validator produced. Two spellings were
  measured to throw **inside** the normalisation — i.e. to convert a declared 400 that names the bad
  field into a genuine unhandled 500: a `null` entry (because `typeof null === 'object'`, and the
  natural spelling of the `PathSegment` branch is `typeof entry === 'object' ? entry.key : entry`),
  and a non-iterable `path` (because the natural spelling of *"copy it"* is
  `[...(issue.path ?? [])]`). Shipped is an `entry !== null && 'key' in entry` guard and
  `Array.isArray(issue.path) ? … : []`, both held by `test/validation.test.ts`.
- **Locations are `body`, `query`, `params`. `headers` is deliberately excluded** — h3 offers no
  analogue, header contracts are a middleware/gateway concern, every header value is a string. Recorded
  as an explicit rejection because `location` is a closed union: adding a fourth member later widens a
  published payload, a real (if small) consumer-visible change.
- **Status is 400 by default and genuinely swappable.** An app standardising on 422 declares its own
  catalogue with the same tag and lists that instead; the definer looks the tag up in the *composed
  catalogues at runtime* and raises that variant. Guarded by a 12-style guard-first
  `ValidationShapeGuard`, which makes a variant tagged `invalid-input` whose payload the module cannot
  fill a compile error naming `__invalidValidationPayload__` (`neg/n4`).
- **Opting out is free and needs no machinery.** Declare `body:` and simply do not list the catalogue:
  validation still runs and still 400s, but throws **unmarked**, landing in the ordinary Nuxt channel.
  The published union then matches `errors:` exactly. So there is no presence guard and no opt-out
  flag. *Cost, stated plainly:* an author who wanted the typed variant and forgot the catalogue gets
  no compile signal, and discovers it when the tag is missing from the client union. Weighed against a
  guard-plus-flag, which detects that mistake but reintroduces the same silence through the flag and
  adds a second guard to the most-read surface.

  > **⟳ Measured in implementation — the unmarked throw carries `data: { issues }`.** §3.3 promises
  > only that an opted-out route *"throws **unmarked**, landing in the ordinary Nuxt channel"*.
  > Shipped keeps the normalised issues on `data`, one hop shallower than the marker. It costs
  > nothing, it keeps an opted-out route's failure machine-readable, and it is deliberately **not**
  > the marker — `declaredError` answers `undefined` for it, which is the whole of *"the published
  > union matches the declaration exactly"*. It is nonetheless a wire surface this section did not
  > mention, and a consumer reading `err.data.data.issues` off an opted-out route depends on it.
- **Input is delivered eagerly and flat** — `(event, { fail, body, query })`. Only *declared* locations
  appear; destructuring `params` on a route that never declared it is `TS2339`, not `undefined` at
  runtime (`neg/n3`). **Consequence, documented not solved:** on a route whose auth check lives in the
  handler body, a malformed request from an unauthenticated caller gets 400 before 401, so issue
  messages disclose field names to that caller. An app that cares puts auth in Nitro middleware, which
  runs before the handler.

### 3.4 Client: `useTypedFetch` / `useLazyTypedFetch` (10)

A **full five-overload mirror** of vanilla `useFetch` that adds typings only.

```ts
interface UseTypedFetch {
  // ×5, one per vanilla overload (fetch.d.ts:27-33), with the ErrorT slot DELETED from each
  <ResT = void, ReqT extends NitroFetchRequest = NitroFetchRequest, const Method extends …, …>
    (request, opts: UseFetchOptionsWithTransform<…>)
    : AsyncData<…, TypedErrorRef<ReqT, Method> | undefined>
  …
}

export const useTypedFetch:     UseTypedFetch = …
export const useLazyTypedFetch: UseTypedFetch = …   // `lazy: true` supplied at runtime, as vanilla does
```

- **All five overloads are mirrored, because a missing overload *is* the compile error the
  degradation lock forbids.** 09's single signature broke `useTypedFetch<Foo>(url)` and
  `useTypedFetch(url, 'my-key')`. Overloads 2 and 4 differ from 1 and 3 only in `DefaultT` defaulting
  to `DataT`, and 02 measured that they never win resolution — but 02 also listed *what selects them*
  as **Not established**, so they are mirrored rather than dropped on an unfinished understanding.
- **The `ErrorT` slot is deleted, not reordered.** Measured: `ErrorT` sits at generic position #2 and
  `ReqT` at #3, and `TS2744: Type parameter defaults can only reference previously declared type
  parameters` makes `ErrorT` unable to default from anything computed from `ReqT`. 09 hoisted `ReqT`
  to the front, which works but costs `ResT` position #1 and with it `useTypedFetch<Foo>(url)`.
  Deleting the slot and computing the error **in the return type** compiles clean and keeps `ResT` at
  #1. The slot loses nothing real: 02 measured that passing #2 explicitly collapses `ReqT` to
  `NitroFetchRequest` and `data.value` to `unknown`, so no caller could ever use it.
- **`error` keeps holding a `NuxtError`.** The wrapper never replaces the ref at runtime. Vanilla's
  `asyncData.js:375` unconditionally runs `asyncData.error.value = createError(error)`, so declaring
  `error.value` as a bare tagged union would type-check while lying. The honest declaration is the
  **envelope**: `NuxtError<DeclaredErrorBody<Declared>>`.
- **Every vanilla option carries over verbatim** — `transform`, `pick`, `default`, `lazy`, `watch`,
  `immediate` — and none can interact with the error typing, because the error type is computed from
  `ReqT` + `Method` alone and never touches `DataT`. `default` is, per 02, the *sole* driver of
  `data`'s absent member, which is `undefined` and **not** `null`; mirroring overloads 1–4 verbatim is
  what preserves that. `lazy`/`immediate`/`server` have zero type effect.
- **`useTypedFetch` must be declared as a named `interface` with the value a const of that type.**
  Measured: 1075 chars of rendered hover as a bare `function` declaration, **55** as a named
  interface. Vanilla `useFetch` is 94 for exactly this reason. This is a mandate, not a style note —
  see §8.3.
- **⟳ Measured in implementation — the pair must be registered in
  `nuxt.options.optimization.keyedComposables`, and this spec did not say so.** Nuxt injects a
  per-call-site key into `useFetch` calls, and that key is what keeps two components fetching the
  same URL from sharing one `useAsyncData` entry. A wrapper is invisible to that transform unless
  the module registers it. Measured against a real production build with a duplicate call added:
  **9** distinct `$f…` data keys in the SSR payload with the registration, **7** without — the
  duplicate pair collapses, and so does a `useTypedFetch`/`useLazyTypedFetch` pair on the same
  route, because `useFetch`'s fallback key is hashed from the request and the option segments alone.
  Without it the wrapper is *behaviourally* narrower than the composable it mirrors, which is §6.1's
  degradation lock failing one layer below where the rest of it is enforced. `argumentLength: 3` is
  vanilla's own. The payload-count observation is not kept as a test — it counts keys in Nuxt's
  payload format rather than anything this module contracts for — but the registration it measured
  is asserted structurally: `test/module-setup.test.ts` reads the two entries off a real `loadNuxt`
  boot of the playground, so deleting them is a red test rather than a silent behavioural
  narrowing. §3.5's `$typedFetch` needs no equivalent — it is not a keyed composable.
- **⟳ Measured in implementation — this composable has no hand-writable published specifier**, and
  that is forced rather than chosen. See §3's note: the `addImports` registration is the whole
  contract for these two names, `#imports` is the spelling for a call site that wants it written
  out, and no fourth `exports` entry was added.
- **No `useAsyncData` counterpart.** `useAsyncData(key, handler)` takes a **function, not a route
  literal**, so there is no path for the map to be keyed by and the union cannot be inferred from
  anything in the call. A wrapper could only re-ask the user for the route — at which point it is
  `useTypedFetch` with an extra, *unverifiable* argument: nothing would make the handler actually call
  the path it claims. **This departs from the author's intended shape item 4 and is recorded as a
  departure.** Both routes to typed errors already exist without new API:

  ```ts
  const loadUser = () => $typedFetch('/api/users/1')                           // ⟳ hoisted — see below
  useAsyncData(loadUser)                                                       // compose with §3.5
  useAsyncData<User, DeclaredErrorBody<DeclaredErrorsOf<'/api/users/:id','get'>>>('user', () => …)
  ```

  > **⟳ Measured in implementation — the first route needs its loader hoisted out of the call, and
  > the reason is not this module's.** Written inline as this section originally had it —
  > `useAsyncData(() => $typedFetch('/api/users/1'))` — the arrow's return is contextually typed by
  > `useAsyncData`'s own unresolved type parameter, which keeps `R` unresolved inside the fetch call
  > and walks `NitroFetchOptions<R>`'s method expression into `MatchedRoutes`' scoring conditional:
  > **14 `TS2321`, one per `InternalApi` key**, in the playground's app program. It is §9.9 trap 9's
  > mechanism from a third door, and it reproduces **identically with vanilla `$fetch`** —
  > `useAsyncData(() => $fetch('/api/users/1'))`, no part of this module in it, gives the same 14 on
  > the same line. Hoisting removes the contextual type and both spellings are clean. So the
  > composition this section leans on works; it needs one line of spelling, and the spelling is
  > vanilla's problem rather than this design's.

  The second works because `NuxtErrorFor<T> = T extends Error | NuxtError ? T : NuxtError<T>`, so an
  explicit payload type lands on exactly the shape `declaredError()` reads. 02 flagged
  `NuxtErrorFor`'s distribution as a hazard; here it is harmless, because `DeclaredErrorBody<Union>`
  is one type with the union nested inside — nothing to distribute over.

### 3.5 Client & server: `$typedFetch` and `$typedFetch.safe` (11)

**Both behaviours ship, because they cannot live in one function.**

```ts
const user = await $typedFetch('/api/users/123')        // throws, exactly as $fetch does
const r    = await $typedFetch.safe('/api/users/123')   // returns the declared union
```

```ts
interface $TypedFetch<DefaultT = unknown, DefaultR extends NitroFetchRequest = NitroFetchRequest>
  extends Base$TypedFetch<DefaultT, DefaultR> {
  safe   <T = DefaultT, R extends NitroFetchRequest = DefaultR, O extends NitroFetchOptions<R> = NitroFetchOptions<R>>
         (request: R, opts?: O): Promise<SafeResultFor<R, T, O>>
  raw:    $Fetch<DefaultT, DefaultR>['raw']
  create <T = DefaultT, R extends NitroFetchRequest = DefaultR>(defaults: FetchOptions): $TypedFetch<T, R>
}

declare global { var $typedFetch: $TypedFetch }

// the method is computed ONCE, as a defaulted parameter of an ALIAS — see below
type SafeResultFor<R extends NitroFetchRequest, T, O extends NitroFetchOptions<R>,
                   M = NitroFetchOptions<R> extends O ? 'get' : ExtractedRouteMethod<R, O>> =
  TypedResult<TypedInternalResponse<R, T, Extract<M, RouterMethod>>,
              DeclaredErrorsOf<R, Extract<M, RouterMethod>>>

type TypedResult<T, D extends AnyVariant> = [D] extends [never]
  ? { ok: true, data: T }
  : { ok: true, data: T } | { ok: false, error: Flatten<D> }
```

> **⟳ Measured in implementation — four spellings in that block moved, and each moved for a reason.**
>
> - **`Flatten` sits inside `TypedResult`'s body, not on the argument.** The spelling this section
>   originally wrote — `TypedResult<…, Flatten<DeclaredErrorsOf<…>>>` — works and is the *worse* of
>   the two: rendering `typeof safe` against the real playground map gives **273** chars flat with
>   `Flatten` in the body, **432** of `Simplify<SerializeObject<…>>` residue with it nowhere, and
>   **333** — flat, but one name longer — with it on the argument. The extra name is specific to a
>   *constrained* parameter: `Flatten<D>` over a `D extends AnyVariant` is no longer known to satisfy
>   that constraint, so the argument has to be written `Flatten<…> & AnyVariant` and the intersection
>   is what the printer echoes. See §8.3(a), which this measurement corrects the *position* of.
> - **The method expression is instantiated once, in a defaulted parameter of a type *alias*.** §10.3
>   Option 1 says instantiate once; the obvious spelling of that is a fourth type parameter on the
>   call signature carrying the constraint its two use sites need
>   (`M extends RouterMethod = …`). **Measured: three `TS2321 Excessive stack depth`, one per
>   `InternalApi` key, reported inside `src/runtime/types.ts` itself** — and it takes the whole
>   signature down with it, collapsing `data` to `unknown` and the declared union to `never`, so
>   every assertion written about a `.safe` call becomes vacuously about `unknown`. A type parameter's
>   default is checked against its constraint **eagerly, at the declaration**, with `R` and `O` still
>   unresolved, which walks `NitroFetchOptions<R>`'s `Uppercase<AvailableRouterMethod<R>>` into
>   `MatchedRoutes`' scoring conditional. An *alias*'s parameters are checked when a call site
>   instantiates them, by which time the request is a literal; `Extract<M, RouterMethod>` then
>   satisfies what the constraint would have. Zero `TS2321` anywhere afterwards. The constraint this
>   section puts on `TypedResult` — `D extends AnyVariant` — was suspected of the same problem and
>   **is not**: it compiles clean in every program and ships as written.
> - **`raw` is indexed out of Nitro rather than restated.** A pure passthrough spelled a second time
>   is free to drift from what it passes through. `create`'s parameter is likewise
>   `Parameters<$Fetch['create']>[0]` — which is ofetch's `FetchOptions`, and **ofetch is not a
>   dependency of this package**: §7.2's rule adds one only where instance identity demands it, which
>   is a run-time property nothing in a type has. Indexing Nitro's own declaration is exact by
>   construction and adds no catalog entry. `Base$TypedFetch<T, R> = Base$Fetch<T, R>` for the same
>   reason, and it is the strongest available statement of *"the default entry point is a pure
>   typings mirror of vanilla"*: it cannot drift, because it is vanilla.
> - **`raw` runs the header merge**, which makes it not quite the *"pure passthrough"* this section
>   calls it. §3.8's *"every request the module makes must carry `accept: application/json`"* is the
>   wider rule and `raw` is a request: a `raw` call on a route outside `/api/**` that fails would
>   otherwise get an HTML error page, and its caller is exactly as entitled to read the marker off it.
>   *Passthrough* stays true where this section argues it — `raw`'s **type** is Nitro's own, and it
>   grows no `.safe`.

> **⟳ Measured in implementation — how the global is *installed*, which this section did not say.**
> The two obvious answers are both wrong. Shipped is a `declare global { var $typedFetch }` in
> `./runtime/types` — which reaches all three programs because the emitted map imports that file and
> is `/// <reference>`d from each (measured: deleting the block gives 7 errors in the playground's app
> program and 4 in its server program) — plus **two** runtime plugins: `addServerPlugin` for Nitro,
> which is what makes this section's *"callable inside a Nitro handler with no new entry point"*
> true, and `addPlugin({ …, mode: 'client' })` for the browser. **The `client` mode is load-bearing
> and was measured**: with an all-modes app plugin, deleting the *server* registration still passed
> the whole e2e suite, because the app plugin runs during SSR, writes the same one `globalThis`, and
> the page render happens to come first. Client-only, that deletion is 6 failed e2e tests. An
> auto-import (`addImports` + `addServerImports`) was considered and rejected: it gives the same
> call-site ergonomics with less machinery, but this section declares a **global**, and a name that
> is not on `globalThis` is not one — a `.js` file, a template expression, or any code Nuxt's
> unimport transform does not reach would not see it. *⟳ Since asserted structurally, without a
> browser:* both of the client plugin's deletion modes are red in `pnpm check` —
> `test/module-setup.test.ts` holds the `mode: 'client'` registration on a real `loadNuxt` boot, and
> `test/typed-fetch.plugin.test.ts` executes the plugin against the `#app` recording double and
> holds the `globalThis` write to be the module's own `$typedFetch` instance. What stays unobserved
> is Nuxt shipping and executing a registered client plugin in a real browser — upstream's own
> contract, §9.7 item 5.

- **The `[D] extends [never]` collapse is mandatory** and for a reason that is *not* the one 10
  needed it for: a union member whose *property* is `never` is **not itself `never`**, so the naive
  declaration leaves `{ ok: false, error: never }` standing on an undeclared route — `ok` stays
  `boolean` and `data` is unreachable without a branch that can never be taken. Measured. With the
  collapse, an undeclared route's `.safe` is `{ ok: true, data: T }`, `ok` narrows to the literal
  `true`, and the degradation lock holds on this surface too. Narrowing was verified both directly and
  **after destructuring**, which is how call sites will be written.
- **Why the throwing form could not be the only one.** `declaredError(err)` **does not work in a
  `catch`**: under `--strict` a catch variable is `unknown`, so overload resolution has nothing to
  infer `E` from and falls to 08's floor — `TS2339` on every payload, and a typo'd tag comparing
  silently as `string`. TypeScript does not type exceptions, so **a return type is the only position
  that can carry the union**. Measured, with the control in the same file (the identical reader call
  on a value reached through a return type) narrowing exhaustively.
- **Why the returning form could not be the only one.** Three reasons, ascending: it puts a permanent
  `.data` shape tax on every undeclared route and external URL (breaking the degradation lock); a
  return-shape change is not a typing change (against the author's intended shape item 4); and **10 §7
  already depends on the throwing form** — `useAsyncData(() => $typedFetch(…))` would break, reopening
  10's no-`useAsyncData`-counterpart decision.
- **`ok` is the discriminant and `error` is the flat variant.** The wrapper has already run
  `declaredError()` internally. The `NuxtError` envelope is not surfaced because it carries nothing a
  caller needs: 08 put `status` on the variant and made `message` and `statusMessage` both the tag.
- **The one unavoidable cast in the whole design lives inside this wrapper**: `declaredError(err)`
  sees an `unknown` and returns the floor, which the wrapper asserts to `D`. That is the correct
  place for it — the module's own frame, not a call site — and it is exactly where the closed-union
  tail (§6.4) lives.
- **The namespace is a full mirror, verified against the real declaration.** Nitro's `$Fetch` is a
  **single** call signature plus exactly `raw` and `create` — there is no `native` (that is on
  ofetch's own interface) and no overload set. `raw` is a pure passthrough (ofetch throws on
  `!response.ok` there too), `create` returns `$TypedFetch<T, R>` so `.safe` survives on created
  instances, and neither gets its own `.safe`. Not mirroring them was rejected because `$typedFetch.`
  showing a shorter completion list than `$fetch.` is a visible way to fail the degradation lock.
- **`.safe` reads as one sentence:** *`.safe` returns what the route declared; everything else throws,
  as it always did.* A fully defensive call site writes both a branch and a catch — but that catch is
  the one vanilla `$fetch` already required, so `.safe` adds a branch and removes nothing. The name
  implies the default is unsafe, which it is not (it is just vanilla); the docs say so in one line
  rather than picking a less legible word. Precedents: ofetch's own `$fetch.raw`/`$fetch.create`
  namespacing, and zod's `parse`/`safeParse`.

### 3.6 Server-to-server: `event.$typedFetch` (14)

```ts
export default defineTypedEventHandler(
  { errors: [orderErrors] },
  async (event, { fail }) => {
    const r = await event.$typedFetch.safe('/api/users/1')   // headers, cookies, platform bindings
    if (!r.ok) {
      switch (r.error.tag) {                                  // the callee's union, narrowed
        case 'user-not-found': return fail('order-orphaned', { userId: r.error.userId })
        case 'user-suspended': return fail('order-blocked', {})
      }
    }
    return { order: await load(r.data.id) }
  },
)
```

- **Typed as `Base$TypedFetch<unknown, NitroFetchRequest>` plus `.safe` — no `raw`, no `create`** —
  because that is exactly what `event.$fetch` is. It is **not** a copy of `$TypedFetch`.
- **Installed by a Nitro server plugin's `request` hook**, wrapping `event.$fetch` rather than the
  global (which is what preserves context):

  ```ts
  nitroApp.hooks.hook('request', (event) => {
    event.$typedFetch = makeTypedFetch((req, init) => event.$fetch(req, init))
  })
  ```

  Declared through a `declare module 'h3'` augmentation on `H3Event`.

  > **⟳ Measured in implementation — *"the line above Nitro's own"* is not reachable and would not
  > work.** Nitro's `onRequest` assigns `event.fetch`, `event.$fetch`, `event.waitUntil` and
  > `event.captureError` and *then* calls the `request` hook (`app.mjs:61-77`). A `request`-hook
  > plugin therefore always runs the line **after** Nitro's four — which is what makes `event.$fetch`
  > exist to be wrapped at all, so the snippet above depends on it. The substance survives unchanged
  > (a fifth closure alongside four that already exist, at Nitro's own cost); only the word *above*
  > was wrong.
  >
  > **The binding of the `declare module 'h3'` block is only observable from a real app.** Removing
  > it gives 6 `TS2339` in each of the playground's two programs and **1** in the package's own; a
  > hermetic fixture cannot tell *"bound to the h3 the consumer uses"* from *"bound to some h3"* at
  > all. The install was re-verified alongside it — exactly one `h3@1.15.11` directory, resolved
  > identically from the package and from the playground — which is §7.2's premise measured rather
  > than assumed.
- **This gives the module runtime presence on every request**, where until now it was import-only.
  Accepted because it is Nitro's own idiom at Nitro's own cost: `app.mjs:61-76` already assigns
  `event.fetch`, `event.$fetch`, `event.waitUntil` and `event.captureError` per request, so this is a
  fifth closure alongside four that already exist. It also rides an **`@experimental`** h3
  augmentation — accepted because if `event.$fetch` moves, the failure is a compile error in one
  module file rather than a silent behaviour change in user code.
- **The global `$typedFetch` also works verbatim inside a Nitro handler**, with no new entry point.
  `event.$typedFetch` exists purely for context forwarding.

  > **⟳ Measured in implementation — *"cookies + context forwarded"* is right about cookies and
  > optimistic about context. An arbitrary key on the caller's `event.context` does NOT reach the
  > callee, and exactly two things do.** Traced through the three files that carry it and then
  > measured both ways: h3's `fetchWithEvent` puts the caller's context on the fetch init
  > (`context: init?.context || event.context`, `h3@1.15.11 dist/index.mjs:1263-1274`);
  > `node-mock-http@1.0.5` parks that object on the **inner request** as `__unenv__` rather than on
  > the inner event; and Nitro's `onRequest` reads exactly two things out of it — `_platform`, which
  > it spreads into the callee's own `event.context`, and `waitUntil`
  > (`nitropack@2.13.4 dist/runtime/internal/app.mjs:48-59`). Measured against a real built
  > playground on `/api/context-echo`: `event.context._platform = { probeToken: 'from-outer' }` in
  > the caller arrives as `event.context.probeToken === 'from-outer'` in the callee, and
  > `event.context.probeToken = 'from-outer'` arrives as **`none`**.
  >
  > **The honest statement of what this surface forwards is: the incoming request's headers and
  > cookies, the caller's platform bindings, and its `waitUntil`.** The caller's context *object* is
  > reachable by a callee that wants it, at `event.node.req.__unenv__`. Nothing in the implementation
  > changes — this is h3's and Nitro's behaviour and the module only rides it.
- **The map indexer is public and is named `DeclaredErrorsOf<R, M>`**, exported from `/types`. It is
  public whether or not it is blessed, because `.safe`'s emitted signature carries
  `Flatten<DeclaredErrorsOf<…>>` unevaluated. `M` defaults per 06's presence rule, so the common form
  is `DeclaredErrorsOf<'/api/users/:id'>`. Callers need it because remapping a callee's failure is the
  blessed server-to-server shape:

  ```ts
  import type { DeclaredErrorsOf } from '@dphonys/nuxt-handler-errors/types'
  function toOrderFailure(e: DeclaredErrorsOf<'/api/users/:id'>): OrderTag { switch (e.tag) { … } }
  ```

  *(Tickets 10 and 11 name the internal `ErrorsOf` in their prose signatures. The rename is cosmetic
  and changes neither decision; `DeclaredErrorsOf` is the name that ships.)*
- **The module ships no propagation mechanism.** A caller writes `if (!r.ok) return fail(…)`. To
  forward a callee's variant verbatim it imports the same catalogue and declares it in its own
  `errors: [...]` — which already works, with zero new API. The rule is one line:

  > **A route's declared union is exactly what it wrote in `errors: [...]`. Where a variant is
  > *produced* — in the handler body, in a helper, or forwarded from a callee — is invisible to the
  > client and is not a design question.**

  The feared "leaks an internal contract to the client" turns out to be **unrepresentable as an
  accident**: `fail('b-thing')` is `TS2345` unless the tag is in the caller's own declaration, so
  forwarding is always an explicit act of publication.
- **Composition happens through catalogue *values*, never through route paths.** 06 left the map
  type-level only, so there is no runtime object to compose from a path; the arrow runs
  catalogue → handler → brand → map and never back.
- **Guidance, not mechanism: prefer `.safe()` server-to-server.** An `ok: false` you ignore is a
  compile-visible omission; an escaped throw is not. See §6.5 for what an escaped throw actually
  costs.

### 3.7 The readers: `declaredError` / `useDeclaredError` (10 §1)

**No call site ever writes 08's frozen wire key.** The reader pair is the only read path.

```ts
// value form — imperative code, catch blocks, server-to-server. On `/shared`.
export function declaredError<E extends AnyVariant>(
  err: DeclaredErrorCarrier<E> | null | undefined
): E | undefined
export function declaredError(err: unknown): AnyVariant | undefined

// reactive sibling — templates. Also on `/shared`; also a PAIR.
export function useDeclaredError<E extends AnyVariant>(
  err: Ref<DeclaredErrorCarrier<E> | null | undefined>
): ComputedRef<E | undefined>
export function useDeclaredError(err: Ref<unknown>): ComputedRef<AnyVariant | undefined>

// the structural carrier a real NuxtError<DeclaredErrorBody<E>> inhabits
type DeclaredErrorCarrier<E extends AnyVariant> = { data?: DeclaredErrorBody<E> | undefined }
```

> **⟳ Measured in implementation — three spellings moved, and the reactive form gained a home and a
> sibling overload.**
>
> - **The first overload cannot name `NuxtError`, and shipped is a structural carrier.** `NuxtError`
>   lives behind `#app`, which does not exist in a consumer's server or `shared/` directory — the two
>   contexts this section puts the value form on `/shared` *for* — and naming it would make Nuxt's own
>   error type part of this module's published signature (§8.1). A real
>   `NuxtError<DeclaredErrorBody<E>>` inhabits `DeclaredErrorCarrier<E>` (asserted against a byte
>   replica of h3 1.15.11's `H3Error` and Nuxt 4.5.1's `NuxtError`), and `NuxtError<unknown>` does
>   **not** — which is what keeps the degraded second overload reachable.
> - **`useDeclaredError` lives on `/shared` too, and that puts a `vue` import there.** This section
>   annotated only the value form. §3 publishes three specifiers: `./types` is type-only and `.` is
>   import-protected from app code, so `/shared` is the only hand-writable home a composable can have
>   — and this section's own rule requires it to have one. `vue` is therefore a **fourth**
>   catalog-ranged `dependency`, on §7.2's instance-identity reasoning: Vue's reactivity is
>   module-global, and two copies mean a `computed` that does not track the other's ref. Measured: a
>   real production Nitro build of the playground resolves and bundles `/shared` unchanged with `vue`
>   in it, and all three `vue-tsc` programs stay green. **§7.2's dependency list below is one short.**
> - **The composable is a pair, and both first overloads take `| null`.** A second
>   `(error: Ref<unknown>) => ComputedRef<AnyVariant | undefined>` overload is not optional: a vanilla
>   `useFetch` on a declared route yields `Ref<NuxtError<unknown> | undefined>`, so without it the
>   commonest call site in an app today is a compile error rather than a degradation, which §6.1's
>   lock forbids. The `| null` this section writes for the value form and omits for the composable is
>   kept symmetrical.
> - **The `Ref` parameter is correct and the invariance worry that would replace it is unfounded.** A
>   read-only `{ readonly value: T }` view was written first, on the theory that Vue declares `Ref`
>   with a getter *and* a setter and is therefore invariant in `T`. Measured, it does not reproduce:
>   TypeScript compares object properties covariantly whether or not they are writable, and `Ref`,
>   `ComputedRef`, `ShallowRef` and `Readonly<Ref<…>>` all match with `E` inferring correctly. The
>   extra exported type was one more name on a surface §8.1 makes permanent, and it is gone.

Why a reader rather than an envelope walk: the honest address is
`err.data.data.__declaredError__` — three property hops, two optional, ending on a key 08
deliberately **froze as wire protocol**. Left raw, that address is typed by hand at every call site,
which quietly converts a renameable protocol detail into a breaking change for every consumer.

Verified against a byte-copied replica of h3 1.15.11's `H3Error` and Nuxt 4.5.1's `NuxtError`
(the replica exists because the reference tree's own `.d.ts` files do not resolve their transitive
deps from outside the install, which would have degraded the probe to `any` and made it vacuous):

- the union infers back out through **two** generic levels and narrows with payloads intact in every
  branch, including a `const _never: never` exhaustiveness assertion;
- an undeclared route (`NuxtError<unknown>`) falls to the **second** overload, degrading to 08's
  shape floor rather than to `never` or a compile error;
- an `@ts-expect-error` confirms the floor is **not** assignable to the declared union — the degraded
  branch is genuinely the floor and not a silent `any`.

Three consequences worth stating:

1. **Narrowing lands on a local const.** This is the only thing that survives `.value` reads and
   template weakness; a `NuxtError`-shaped read cannot narrow across `.value` boundaries reliably.
2. **Declared and undeclared are separate channels by *presence*, not by union.** `error` is exactly
   vanilla's channel; `declaredError()` returning `undefined` *is* "not a declared failure". No caller
   pays a narrowing tax to reach `.status` on a 500.
3. **The reader is the shared primitive** — written once, used by §3.4, §3.5 and §3.6.

### 3.8 Header handling — three surfaces, three different merges, and one shared helper would be a defect

> **⟳ Measured in implementation — this section is written for two surfaces and there are three.**
> It groups `$typedFetch` and `useTypedFetch` together as *"global wrapper — build a `Headers`"* and
> reserves the flatten for `event.$typedFetch`, on the grounds that only the event-bound wrapper
> reaches h3's `fetchWithEvent`. **`useFetch` reaches `fetchWithEvent` too**: its runtime swaps in
> `useRequestFetch()` — which *is* `event.$fetch` — for every same-origin request during SSR
> (`nuxt@4.5.1 dist/app/composables/fetch.js:106-109`), and SSR is the case this section exists for.
> Three mutations against a real built playground, on a route that echoes back the headers it
> received, with the call site passing `headers: new Headers({ 'x-probe': 'kept' })`:
>
> | merge | `accept` received | caller's header received |
> | --- | --- | --- |
> | shipped (`Headers`, then `Object.fromEntries`) | `application/json` | `kept` |
> | this section's global rule (the `Headers` handed on whole) | **none** | **none** |
> | a naive `{ accept, ...opts.headers }` spread | `application/json` | **none** |
> | `accept` not set at all | **none** | `kept` |
>
> Row 2 is the one that matters: following the global rule on this surface discards the caller's
> headers *and* this module's own `accept` — the exact shipped-defect-class bug this section forbids,
> on the exact path it was written to protect. Row 3 is this section's own named bug, reproduced.
> Held by `test/specifiers.test.ts`.
>
> **Two smaller divergences in the same merge.** The global rule is *set `accept` only when neither
> the call nor the instance defaults carry it*, and names `$typedFetch.create`'s closure as what
> checks the second half. The composable has no analogue: Nuxt's `experimental.defaults.useFetch` is
> `Pick<FetchOptions, 'timeout' | 'retry' | 'retryDelay' | 'retryStatusCodes'>` and cannot carry
> headers at all, and an ofetch instance handed in as `opts.$fetch` keeps its defaults in a closure
> nothing can read — so *the call* is the whole of "already carries it" there. And the merge is
> wrapped in a `computed`, because vanilla's option type is `ComputedOptions<HeadersInit>` and
> **every level of it may be a ref**: vanilla never unwraps the inner level because it hands the raw
> object to `reactive()` and ofetch reads through that proxy, while a merge reads the object first
> and must unwrap or a `ref('Bearer …')` arrives as `[object Object]`.

Every request the module makes must carry `accept: application/json`. This is not cosmetic: per 03,
Nitro's `isJsonRequest` heuristic decides whether an error comes back as JSON or as a rendered HTML
error page. On SSR the internal `$fetch` carries no `accept` header, so the decision falls to
`event.path.startsWith('/api/')` — which fails for routes outside `/api/**` **and for every route
under a non-root `app.baseURL`** (ofetch prefixes it, so `/shop/api/x` fails the test). Lose the
header and a declared 403 becomes an HTML string in `err.data`.

**Global wrapper (`$typedFetch`, `useTypedFetch`) — build a `Headers`:**

```ts
const h = new Headers(opts?.headers)
if (!h.has('accept')) h.set('accept', 'application/json')
```

**Event-bound wrapper (`event.$typedFetch`) — build a `Headers`, then FLATTEN it:**

```ts
const h = new Headers(init?.headers)
if (!h.has('accept')) h.set('accept', 'application/json')
return event.$fetch(req, { ...init, headers: Object.fromEntries(h) })
```

The asymmetry is measured and load-bearing. `event.$fetch` is not an ofetch instance — it is
`fetchWithEvent`, which merges headers by **object spread** (`h3/dist/index.mjs:1267-1272`). A
`Headers` instance has no own enumerable properties, so the *correct* global fix spreads to nothing
here, silently discarding both the caller's headers and the module's own `accept`:

```
                        MERGED WITH FORWARDED HEADERS
Headers instance    ->  {cookie, user-agent}                     // caller headers AND accept gone
tuple array         ->  {"0":[…], "1":[…], cookie, user-agent}   // corrupted
plain object        ->  {cookie, user-agent, accept, authorization}
Object.fromEntries  ->  {cookie, user-agent, accept, authorization}   // the fix
```

Two further measured rules:

- **A caller's explicit `accept` is honoured on both surfaces**, and the docs must note that
  overriding it forfeits the declared-error channel for routes outside `/api/**`.
- **`create` defaults combine losslessly** on the global surface: instance defaults and per-call
  headers merge, an instance-level `accept` is honoured, and a call-level `accept` beats it. So the
  global rule is *set `accept` only when neither the call nor the instance defaults carry it* — which
  the `create` closure can check, since it holds its own defaults. **The event-bound wrapper has no
  analogue**: there are no instance defaults, and h3 lists `accept` in `ignoredHeaders`
  (`index.mjs:1138-1147`) so the incoming request's `accept` is never forwarded. `if (!h.has('accept'))`
  is the whole rule there.

  > **⟳ Measured in implementation — *"the `create` closure can check"* is right about the rule and
  > silent about the one thing that makes it hard, and the obvious implementation of it is a
  > shipped-defect-class bug.** ofetch merges an instance's defaults with a **shallow** spread —
  > `defaults: { ...globalOptions.defaults, ...customGlobalOptions.defaults, ...defaultOptions }`,
  > `ofetch@1.5.1 dist/shared/ofetch.CWycOUEr.mjs:337` — so a `headers` key in a nested `create`
  > **replaces** the outer instance's headers wholesale, and a `create` naming no headers leaves them
  > alone. A closure that *accumulates* headers across creates (the obvious spelling, and the one
  > written first) therefore believes an `accept` is still there after ofetch has dropped it,
  > suppresses this module's own, and sends the request with **no `accept` at all** — this section's
  > own named consequence, produced by the code meant to prevent it. Shipped is
  > `'headers' in defaults ? new Headers(defaults.headers) : current`, ofetch's rule mirrored exactly.
  > Found by code review rather than by tests: the first fake fetcher's `create` threw its argument
  > away, so an instance that had lost its `accept` and one that still had it were indistinguishable
  > and the failure read as a pass. The fake now models ofetch's `create` spread and its
  > `mergeHeaders` (`:121-131`) and asserts on what would go on the wire rather than on what the
  > wrapper handed on.

Naive spreading (`{ accept, ...opts?.headers }`) is a **shipped-defect-class bug**, not a style
issue: a caller passing `new Headers({ authorization: … })` — a legal, common form — silently loses
authorization on every typed call.

---

## 4. The type mechanism

The spine. Proven end to end by the ticket 09 prototype — see §13.

### 4.1 The brand (01a, 06)

A route's declared union is attached as an **optional phantom property** on an interface extending
h3's `EventHandler`:

```ts
interface TypedEventHandler<Request, Response, Errors> extends EventHandler<Request, Response> {
  __declaredErrors__?: Errors
}
```

This is idiomatic rather than a trick: h3's `EventHandler` is *already* an interface carrying a call
signature plus optional marker properties (`__is_handler__?`, `__resolve__?`, `__websocket__?` —
`h3/dist/index.d.ts:294-299`).

**Why the brand and the payload can never collide.** `ReturnType` reads only the call signature and
`Serialize` runs after it, so the brand and the response payload occupy **disjoint type positions**.
Vanilla `useFetch` stays clean for free — structurally, not by discipline.

Prefer the **optional** phantom property over a function-typed one, so `TypedEventHandler` stays
inhabited by any plain `EventHandler`.

**`TypedEventHandler` is public API.** It appears in every branded route's emitted `.d.ts` and drags
h3's types with it — see §8.1.

### 4.2 The generated map (06 §2–§4)

`declare module '@dphonys/nuxt-handler-errors/types' { interface TypedApiErrors { … } }` — the module
augments **its own specifier**, never squatting inside `nitropack/types`. Three reasons: a new
interface in Nitro's namespace is squatting and a future Nitro release owning that name breaks
consumers silently; Nitro's own augmentation resolves only because Nuxt pushes `"nitropack/types"`
onto `nuxt.options.typescript.hoist`, so augmenting our own name means we push our own entry and
control it; and `TypedApiErrors` appears in every wrapper signature, so declaring it on Nitro's
specifier would give our public surface a second owner.

**Two load-bearing strings, both fixed:**

```ts
declare module '@dphonys/nuxt-handler-errors/types' { interface TypedApiErrors { … } }
// and in setup():
nuxt.options.typescript.hoist.push('@dphonys/nuxt-handler-errors/types')
```

Without the `hoist` entry the augmentation is **inert** — measured in 09 §6.

> **⟳ Measured in implementation — that no longer reproduces, and the push is kept anyway.** With
> `nuxt.options.typescript.hoist.push(…)` removed, the `paths` entry vanishes from all four generated
> tsconfigs and *both* `vue-tsc` programs still compile clean, assertions and all. The mechanism is
> ticket 01, which the prototype predates: the published `exports` map plus `typesVersions` now
> resolve `@dphonys/nuxt-handler-errors/types` to one file from every context in an app that depends
> on the module directly, so the emitted `declare module` and the consumer's `import type` already
> name the same file without help. The push stays — it is a fixed string in this section, and the
> case it covers is the one no fixture in this repo can reach: a consumer where the specifier does
> *not* resolve from the app root (a module arriving through a Nuxt layer, or a `moduleResolution`
> that ignores `exports`). The gated assertion is therefore on the `paths` entries the push produces,
> not on inertness.

The emitted file must end in `export {}` to be a module rather than an ambient declaration (Nitro
does exactly this, `dist/core/index.mjs:1260-1262`).

**Emission mechanism:**

```ts
addTypeTemplate({ filename: 'types/<name>.d.ts', getContents },
                { nitro: true, nuxt: true, shared: true })

nuxt.hook('nitro:init', (nitro) => {
  nitro.hooks.hook('types:extend', () =>
    updateTemplates({ filter: t => t.filename === 'types/<name>.d.ts' }))
})
```

> **⟳ Measured in implementation — this snippet originally passed `{ nitro: true }` alone, and the
> failure is silent in exactly the place this section cares most about.** `@nuxt/kit` adds the *app*
> reference under `if (!context || context.nuxt)`, the shared one under `context.shared`, and
> `vite.vue.script.globalTypeFiles` under `!context || context.nuxt || context.shared`
> (`dist/index.mjs:1986-1998`) — so passing a context at all opts **out** of everything it does not
> name. Measured against the playground with `{ nitro: true }` alone: the only `/// <reference>`
> written is in `types/nitro-nuxt.d.ts`, the server program still binds, and the app and shared
> programs see the empty published interface — `TS2339` on every route key, `app.vue` first. That is
> this section's own reason 1 (SFC visibility) deleted by its own snippet. Held by
> `test/generated-map.test.ts`'s per-context reference assertions.

`getContents` reads the `Nitro` instance **captured in the `nitro:init` closure** — not `nuxt._nitro`
at render time, though that is a declared field.

**Why `types:extend` is the correctness anchor.** It fires at `nitropack dist/core/index.mjs:1441`
inside `writeTypes`, immediately before the disk write at `:1442`, always preceded by a fresh
`scanHandlers`. Nothing else has that schedule: `nitro:config` is pre-`createNitro` (no handlers),
`nitro:init` fires once per load, and `prepare:types` fires once and in **dev** explicitly skips
route-type regeneration.

**Why a type template rather than a direct `fs.writeFile` from `types:extend`** — the template route
gets three things a hand-rolled write must reproduce: `<script setup>` visibility (`addTypeTemplate`
pushes the file into `vite.vue.script.globalTypeFiles`, and the composable's primary call site *is*
`<script setup>`); server-side program membership (`{ nitro: true }` routes the reference through
`nitro:prepare:types` into Nitro's own tsconfig, which §3.6 needs); and no cold-start dangling
reference (`nuxi dev` races `kit.writeTypes(nuxt)` and `buildNuxt(nuxt)` in a `Promise.all`, so a
direct write can emit a `/// <reference>` to a not-yet-existing file and must seed it in `setup()`).

**No import-path rewriting is needed**, provided the module emits under `types/`. Nitro's `typesDir`
is `resolve(buildDir, 'types')` and Nuxt hands Nitro its own `buildDir`, so the emitted file lands in
the same directory as `nitro-routes.d.ts` and relative handler paths are byte-identical. The
arithmetic is `relative(typesDir, resolveNitroPath(handler, nitro.options))` with the extension
stripped; `relative` is **pathe's** (POSIX slashes), and `resolveNitroPath` is exported from
`nitropack/kit`.

> **⟳ Measured in implementation — that arithmetic, which is Nitro's own line copied verbatim, emits
> a package name for a sibling.** Followed literally it is wrong twice, and both failures are of the
> *silent* kind: `pathe.relative` returns a **bare name** for a handler that resolves into `typesDir`
> itself — and a bare specifier in a `.d.ts` is a package name — and it returns the **absolute path
> unchanged** for a handler on another Windows drive, where prefixing `./` yields `./D:/…`. Shipped
> is the same arithmetic plus *"force `./` unless the result is already relative or absolute"*. Nitro
> has both bugs too; it gets away with them because neither shape occurs in a stock app.

**Route and method keys are re-derived by re-running Nitro's own loop** over
`[...nitro.scannedHandlers, ...nitro.options.handlers]`, so `**`, `**:slug`, `:id` and `(group)`
handling comes out identical by construction. Method keys are lowercased on emit — filesystem
scanning guarantees lowercase, but `addServerHandler` passes `method` through unmodified. Multiple
handlers on one route+method union with `|`.

**`Serialize` and `Simplify` are exported from `nitropack/types`** (`dist/types/index.d.ts:258`).
Import them; do not copy the definitions. The emitted union runs through `Simplify<Serialize<…>>` —
proven lossless on discriminated unions, and it makes `Date`-carrying payloads honest for free.
Corollary: `Serialize` maps `unknown`, `void` and `bigint` to `never`, which is why §3.2's
`payload<T>()` guard exists.

**The map keys *every* route Nitro knows, not only branded ones.** This is what makes the lookup
total: call sites write literals like `/api/users/123`, which `MatchedRoutes` resolves against
`keyof InternalApi` by glob/param scoring. Keying identically lets `MatchedRoutes<R>` be reused
verbatim as the indexer and removes the "matched a route we chose not to key" branch entirely. It
costs nothing: unbranded handlers extract to `never` naturally.

> **⟳ Measured in implementation — *"every route Nitro knows"* has a footnote: not every entry is
> inhabited.** Nuxt registers its island renderer with `handler: '#internal/nuxt/island-renderer'`,
> and `resolveNitroPath` does not resolve that alias — so the emitter faithfully writes
> `typeof import('../../server/#internal/nuxt/island-renderer').default`, which is no file. Measured
> against the real playground: `TypedApiErrors['/__nuxt_island/**']['default']` renders as `any` —
> TypeScript's *error type*, not `never`, per the note on §4.3's `IsAny` mandate — and
> `MatchedRoutes<'/__nuxt_island/foo'>` is `"/__nuxt_island/**"`, so a consumer call to that path
> reaches it, through a raw index **and** through `DeclaredErrorsOf`. **No fix ships:** the only one
> is to skip handlers whose resolved path is not on disk, which puts a filesystem read inside the
> pure emitter and breaks §4.6. Practical exposure is small — the route is Nuxt-internal — and the
> state is pinned by `test/generated-map.test.ts`, which asserts the lookup renders as `any`, so the
> day it stops being true is a visible change rather than a silent one.

### 4.3 The extractor and the lookup (06 §3, 01a)

```ts
type ErrorsOf<R extends string, M extends RouterMethod> =    // public name: DeclaredErrorsOf
  Lowercase<M> extends keyof TypedApiErrors[MatchedRoutes<R>]
    ? TypedApiErrors[MatchedRoutes<R>][Lowercase<M>]
    : 'default' extends keyof TypedApiErrors[MatchedRoutes<R>]
      ? TypedApiErrors[MatchedRoutes<R>]['default']
      : never
```

> **⟳ Measured in implementation — that is the *rule*; shipped is the same rule made total, and its
> written constraint would have rejected this section's own worked table.**
>
> - **The constraint is `M extends RouterMethod | Uppercase<RouterMethod>`.** h3's `RouterMethod` is
>   `Lowercase<HTTPMethod>` — lowercase only — while mandate 2 below says *"both `'DELETE'` and
>   `'delete'` are accepted by vanilla, normalised via `Lowercase<M>`"*, and the three-row table is
>   written `('/api/y', { method: 'POST' })`. Under the constraint as written,
>   `DeclaredErrorsOf<'/api/y', 'POST'>` is `TS2344` and the `Lowercase<M>` in the body can never do
>   anything. The shipped pair is exactly what vanilla admits
>   (`Uppercase<AvailableRouterMethod<R>> | AvailableRouterMethod<R>`,
>   `nitropack/dist/types/index.d.ts:127`). Measured against the three deferred positions §3.4–§3.6
>   could forward from, with `R` and `O` both unresolved: `ExtractedRouteMethod<R, O>` (§10.3's
>   Option 1 spelling) satisfies it, a naked `M extends AvailableRouterMethod<R>` satisfies it, and a
>   raw `Exclude<O['method'], undefined>` **does not** — `TS2344`. So §10.3's *"instantiate once via
>   a defaulted type parameter"* is not merely the cheaper spelling; the raw alternative does not
>   compile against a constrained `M` at all.
> - **The body is wrapped in
>   `MatchedRoutes<R> extends infer Key ? Key extends keyof TypedApiErrors ? … : never : never`**, and
>   the extra layer buys two things the written form does not have. **Totality:** `MatchedRoutes<R>`
>   derives its keys from `keyof InternalApi`, not from `keyof TypedApiErrors`, so a key *Nitro* has
>   and this map does not indexes an interface with no such key — `TS2536`, a compile error at a
>   consumer's call site. That state is reachable: §4.5's re-measured race records the window opening
>   in that direction. With the written body it does not degrade, it errors. **Distribution:**
>   `MatchedRoutes<R>` can answer a *union* when two keys tie on score, and `keyof (X | Y)` is
>   `keyof X & keyof Y` — so the written form asks whether the method is present in **both** entries
>   and then indexes the union, silently narrowing to whatever the two have in common. The shipped
>   form distributes and unions each matched key's own answer, which is what *"every consumption site
>   infers the declared union from the route path alone"* means when the path is ambiguous.

**The method-resolution rule deliberately diverges from Nitro's, and the divergence is required.**
Nitro falls back to `default` when the method lookup is **`never`**, which is safe for Nitro because
a serialized success type is never `never`. For this module `never` is a *legitimate* value — it is
exactly what an unbranded handler yields. Nitro's rule would therefore hand a `POST` caller the
`default` handler's errors:

```
server/api/y.ts       → default, branded, declares E
server/api/y.post.ts  → post,    unbranded, declares nothing
map: '/api/y': { default: E, post: never }
```

Falling back on **key presence** instead is a *mirror of the h3 dispatcher, not an approximation of
it*: h3 registers Nitro's `default` handlers under `"all"` (`h3@1.15.11/dist/index.mjs:2198`) and
dispatches `matched.handlers[method] || matched.handlers.all` (`:2217`) — presence-based,
method-specific first. Verified in a real editor (09 item 10):

| Call | Type resolves | Runtime runs |
| --- | --- | --- |
| `('/api/y')` | `get` absent → `default` → `E` | `handlers.all` = `y.ts` |
| `('/api/y', { method: 'POST' })` | `post` present → `never` | `handlers.post` = `y.post.ts` |
| `('/api/y', { method: 'DELETE' })` | `delete` absent → `default` → `E` | `handlers.all` = `y.ts` |

Nitro's success side agrees on all three, so `data` and `error` stay in lockstep.

h3's *cross-route* fallthrough (`POST /api/files/meta` walking up to `/api/files/**`'s `all` handler)
is deliberately **not** modelled: `AvailableRouterMethod` restricts the method set to the route's own
keys, so that call is already `TS2769` through the typed surface. The block is inherited from vanilla.

**Two mandates on the extractor:**

1. **An `IsAny` guard is required.** `ExtractErrors<any>` yields `unknown`, which poisons narrowing
   for any `.js` or untyped route. `ExtractErrorsSafe<any>` must be `never`. This is also what makes
   §6.6's cycle case degrade safely.

   > **⟳ Measured in implementation — the guard is no protection against a *broken emitted path*, and
   > two follow-on facts belong beside it.**
   >
   > - **An unresolved `import("…")` inside a `.d.ts` produces no diagnostic under `skipLibCheck`**
   >   (which every Nuxt-generated tsconfig sets, and so does this suite's fixture config). The
   >   entry does **not** become `any`: it becomes TypeScript's *error type*, which renders as `any`
   >   but is not `any` — it propagates through every conditional and satisfies whatever constraint
   >   it meets, so this guard never fires on it. Pinned down by asserting
   >   `Expect<Equal<IsAny<Declared>, false>>` **and** `Expect<Equal<IsAny<Declared>, true>>` in one
   >   program against a deliberately-misplaced map and getting zero diagnostics; the same
   >   contradictory pair against the *working* map is `TS2344`, which is the control. **The only
   >   assertion class that catches a broken emitted path is a rendering one**, or a `switch` whose
   >   exhaustiveness is load-bearing. §9.3's budgets and `playground/app.vue`'s narrowing functions
   >   are where that lands.
   > - **The deferred index-signature leak is closed at the map position, by `Serialize`.** A route
   >   module whose default export carries `[k: string]: unknown` satisfies
   >   `{ __declaredErrors__?: infer E }` with `E = unknown`, and the extractor hands that straight
   >   back — the same poison this mandate names, through a different door. But the map never emits
   >   the extractor bare: `Serialize<unknown>` is `never`
   >   (`nitropack/dist/types/index.d.ts:184-186` — `unknown` matches no arm and falls off the end),
   >   so §4.2's wire-honesty wrapper closes the door as a side effect. Measured in
   >   `test/types/emitted-map.test.ts`. **No extra arm is needed for anything reachable through the
   >   map.** What remains is a consumer calling `ExtractErrorsSafe` **directly** on such a type,
   >   which still answers `unknown` — a documentation note, not a code change.
   > - **`Exclude<E, undefined>` on the brand never fires through `defineTypedEventHandler`.**
   >   `infer E` on an *optional* property yields the declared type with no `| undefined`, with
   >   **and** without `exactOptionalPropertyTypes` — measured both ways. The guard is kept and is
   >   asserted through a **hand-written** `TypedEventHandler` whose brand explicitly carries
   >   `| undefined`, which is the only reachable case and is exactly the layer / published-package
   >   handler §4.1 says must keep working.
2. **Method keys are lowercase.** Both `'DELETE'` and `'delete'` are accepted by vanilla, normalised
   via `Lowercase<M>`. A method the route does not declare is already `TS2769`, so the map only needs
   real methods.

### 4.4 The map is type-level only (06 §6)

No emitted runtime value map (`route → method → Set<tag>`). The decisive argument is not bundle size:
**a value map cannot be path-referential.** Nitro never re-runs `writeTypes` on `change` events, and
gets away with it only because its output is `typeof import('…')`, which TypeScript re-resolves on
every edit. A value map resolves its tags at build time, so adding a variant to an existing handler
would leave it stale **with no watcher that would ever fix it** — promoting "confidently wrong is
worse than absent" from the type level, where it cannot happen, to the runtime level, where it
silently can.

This is load-bearing downstream: it is *why* the wire needs a marker (§5), and *why* no
recognised/unrecognised shape is computable on the client (§6.4).

### 4.5 Dev-server behaviour — measured, and safe by direction (09 §2)

| Event | Measured (prototype) | ⟳ Re-measured in implementation |
| --- | --- | --- |
| route added → our map contains it | 950 ms | **835 ms** |
| route added → `nitro-routes.d.ts` contains it | 976 ms (**ours ~26 ms ahead**) | **1379 ms** (**ours 544 ms ahead**) |
| route removed → our map drops it | 631 ms | 337 ms |
| catalogue variant added (content edit) | emitted map **byte-identical** | unchanged — **byte-identical** |

40 samples inside the convergence window: `agree 31, oursAhead 9, nitroAhead 0, misattributed 0`.
**⟳ Re-measured: `agree 34, oursAhead 3, nitroAhead 3, misattributed 0`** (sightings: ours 26, nitro
20 — printed now, because a dev server that died yields `agree 40, misattributed 0` and is otherwise
indistinguishable from a perfect run).

> **⟳ Measured in implementation — two defects in the prototype's own scripts, and one conclusion
> that survives on a different tally.**
>
> - **`dev-race.ts` awaited the two convergence waits sequentially**, and each wait starts its own
>   clock — so `nitroAdd` was timed from *after* our map had already converged. The *"950 ms /
>   976 ms, ours ~26 ms ahead"* row is not a comparison of two elapsed times; the 26 ms is however
>   long Nitro took *after* we were done. Shipped is one `Promise.all`, one instant, two clocks. The
>   direction holds; the magnitude does not.
> - **`dev-race-direction.ts` labelled every *removal* sample backwards.** It tallied *"whoever
>   lists the route is ahead"*, which is right while adding and inverted while removing — and the
>   loop alternates. The original `agree 31, oursAhead 9, nitroAhead 0` therefore mixes two meanings.
>   Shipped compares each file against the edit just made.
>
> **The conclusion survives and "no guard machinery ships" stands**, but on the one tally that was
> ever load-bearing: `misattributed: 0`. **Disagreement is *not* one-directional** — it goes both
> ways in roughly equal measure — and the honest statement is *"one direction is inert
> (`MatchedRoutes` cannot reach a key Nitro does not have) and the other degrades to `never`
> (§6.1's documented silent default, and §4.3's shipped totality wrapper is what makes it a
> degradation rather than a `TS2536`)"*. Neither produces a wrong type, which is what the argument
> needs. Zero samples ever keyed a route to a handler file that was not its own — the only shape that
> would produce a *wrong* error type rather than an absent one.

01b's original "~25 ms" estimate was optimistic by ~40× (the template rides Nuxt's whole regeneration
cycle, not the debounce alone). **It does not matter, because of the direction. No guard machinery
ships.**

The byte-identical content-edit result is the other half: it holds 01b §4's **path-referential
mandate** — the emitted map must be a function of routes and handler *paths*, never of catalogue
content. This is under test at layer 2 (§9.4).

### 4.6 The emitter factoring mandate (18 §4)

**The emitter must be a pure function `(handlers, opts) => string`, not logic inlined into
`setup()`.** This is a constraint on the implementation's shape, not merely on its tests, and it is
recorded here rather than in the testing section for that reason.

It earns its place on a specific mandate no other layer can reach cheaply — 01b §4's
path-referentiality, which the prototype could only measure with a live dev server and which becomes
two lines:

```ts
it('is path-referential: catalogue CONTENT is invisible to the emitted map', () => {
  expect(emitMap(HANDLERS_A)).toBe(emitMap(HANDLERS_B))  // same routes, different catalogues
})
it('06 §5 Option 2 stays reachable', () => {
  expect(emitMap(H, { methodKeys: 'expanded' })).toContain(`'patch'`)
})
```

---

## 5. The wire format

Specified here as a contract an **unrelated client** could implement against. Nothing intercepts it —
no Nitro plugin, no error-handler override; it is one `createError` call at the raise site.

### 5.1 The response

```jsonc
// HTTP/1.1 403 forbidden
{
  "error": true,
  "url": "http://localhost:3000/api/users/9",
  "statusCode": 403,
  "statusMessage": "forbidden",
  "message": "forbidden",
  "data": {
    "__declaredError__": { "tag": "forbidden", "status": 403, "requiredRole": "owner" }
  }
}
```

Produced by:

```ts
createError({
  statusCode: variant.status,
  statusMessage: tag,
  message: tag,
  data: { [DECLARED_ERROR_KEY]: { ...payload, tag, status: variant.status } },
})
```

> **⟳ Measured in implementation — two corrections to the block above, both of them wire contract.**
>
> - **`url` is the *absolute* request URL, not the path.** Nitro 2.13.4 writes it that way. Recorded
>   in `test/wire.test.ts`. §5.5 is written as a contract an unrelated client implements against, so
>   this belongs here rather than only in a test.
> - **The reserved keys are spread LAST.** This section originally wrote
>   `{ tag, status, ...payload }`. With that order a payload field named `status` overwrites the
>   number at runtime while the type still says otherwise — which breaks §5.3's shape floor
>   (`typeof status === 'number'`), the whole basis on which a marker is recognised. The type level
>   already intersects rather than overwrites (`{ tag: K } & P`), so reserved-last is what makes
>   runtime and type agree.

`fatal` and `unhandled` are **left alone**, which means they stay `false` — so the existing
"expected error" convention (`fatal === false && unhandled === false`, honoured by three independent
consumers) is adopted rather than replaced, the prod serializer keeps `data`, and `nuxt-root.vue:77`
never escalates a declared failure to the global error page.

The JSON body is **Nitro's, not Nuxt's**: Nuxt's error handler returns early when `isJsonRequest(event)`,
so the body is built by `nitropack/dist/runtime/internal/error/prod.mjs:54-60`.

### 5.2 The envelope, and why it is shaped this way

**`data.__declaredError__`'s presence is the marker and its value is the variant.** One read, and
what comes back is byte-for-byte the `VariantsOf` member — no excess key to `Omit`, no second concept
in the envelope, and a user payload field can never collide with the marker because they sit at
different levels. The flat variant keeps exactly the two reserved names `tag` and `status` and gains
none.

**`data` is the only extension point, across both hops.** `H3Error.toJSON()` emits only
`{message, statusCode, statusMessage?, data?}`, and the SSR payload reducer/reviver round-trips
through exactly that. `cause`, `stack`, `fatal`, `unhandled` and any custom own property do **not**
survive to the client. There is nowhere else to put the tag, the payload or the marker.

**`FetchError.data` is the whole response body.** ofetch defines `data` as a getter over
`response._data`, and `createError` copies `input.data` wholesale — so the client's `NuxtError.data`
*is* that body object and the envelope is at **`err.data.data.__declaredError__`**, three hops. This
corrects ticket 02 by one level.

**`message` and `statusMessage` are both the tag.** `statusMessage` is not optional in practice:
Nitro does `error.statusMessage || "Server Error"` (`prod.mjs:20`), so leaving it unset makes every
declared 403 report `Server Error` in the body *and* as the HTTP reason phrase. Setting both to the
tag costs nothing, keeps log grep and code grep on one string, and needs no status→phrase table
(`node:http`'s `STATUS_CODES` is absent on edge/worker presets). Tags are kebab-case ASCII, so h3's
`sanitizeStatusMessage` leaves them untouched and the `[h3] Please prefer using message…` warning
never fires.

**The key is frozen protocol and deliberately does not track the package name.** 06 made the package
name load-bearing for `declare module '<package>/types'`; that coupling is **not** extended to the
wire, so the package may be renamed, rescoped or relocated without desynchronising a deployed server
from a deployed client. It is exported as `DECLARED_ERROR_KEY` from `/shared` so no code writes the
literal.

**Versioning is by key rename, and that is a feature.** A future incompatible envelope uses a new key;
an old client sees no marker it recognises and falls back to the undeclared channel — the conservative
direction — with no version-negotiation policy to write and no half-understood envelope to interpret.
This is precisely why the marker's value is the variant rather than a version number alongside it.

### 5.3 The shape floor — the whole evidence the client gets

```ts
export const DECLARED_ERROR_KEY = '__declaredError__'

export function readDeclaredError(err: unknown): { tag: string, status: number } | undefined {
  const v = (err as any)?.data?.data?.[DECLARED_ERROR_KEY]
  return v && typeof v === 'object'
    && typeof v.tag === 'string' && typeof v.status === 'number'
    ? v
    : undefined
}
```

**The wire guarantees exactly that floor** — a string `tag` and a number `status`. Payload keys are
unconstrained. Marker present but floor unmet (a proxy rewriting bodies, a mangled response, a
hand-rolled imitation) reads as **undeclared**, not as a malformed declared failure.

**`variant.status` is authoritative; the HTTP status is best-effort.** h3's `sanitizeStatusCode`
rewrites anything outside 100–999 to the default, so a bogus catalogue status yields a 500 on the
wire while the type still says what was declared. The client reads `status` from *inside* the marker,
which is the value the generated type promises. Duplicating it there rather than relying on
`statusCode` is what makes the two agree by construction.

### 5.4 Verified on all three paths (09 item 11)

Six e2e tests against a real built server:

| Path | Result |
| --- | --- |
| Client fetch | `err.data.data.__declaredError__` deep-equals `{...payload, tag, status}` |
| Real HTTP | status 403, reason phrase `user-suspended`, body exactly as §5.1 |
| A framework error sharing the status | `/api/boom` throws a hand-rolled 403 with its own `data`; **no marker**, `data` untouched — "the discriminator is marker presence, not status", confirmed by execution |
| SSR | envelope survives server render and narrows there |
| Post-hydration | Nuxt's real reducer/reviver pair run over the real `__NUXT_DATA__` payload, decoded with `devalue`. **No browser was driven** — what is proven is that the two functions the browser runs round-trip the envelope losslessly |
| A route outside `/api/**` | `/status?fail=1` returns JSON **with** `accept: application/json` and `text/html` **without** it — §3.8's lock demonstrated, not reasoned |

> **⟳ Measured in implementation — the last row's *consequence* is not observable from this repo's
> e2e client, and the shipped assertion is on the header instead.** §3.8 says losing `accept` turns a
> declared failure into an HTML error page via Nitro's `isJsonRequest`. Measured against the real
> built playground: a route outside `/api/**` still answers JSON with **no** `accept` header at all,
> because `@nuxt/test-utils`' own client sends `sec-fetch-mode: cors` and `getProxyRequestHeaders`
> forwards it (h3's `ignoredHeaders` strips `accept` but not that), which satisfies `isJsonRequest`
> on its own. Confirmed by echoing the whole forwarded header set. A real browser navigation sends
> `sec-fetch-mode: navigate`, so §3.8's mechanism is intact — it is the *observation* that is not
> available here. `test/specifiers.test.ts` therefore asserts **the header the server received**,
> which is the direct measurement rather than a circumstantial one.

**Server-to-server holds structurally, not by luck.** `localFetch` routes every `/`-leading call
through `toNodeListener(h3App)` (`app.mjs:95-114`), so an internal call is a full app pass: middleware
runs, the router runs, and `onError` runs — the same Nitro serializer that produces the body on a real
request. There is **no** path on which a declared failure arrives as an unserialized thrown object.
No second wire format exists to normalise.

### 5.5 What an unrelated client needs to know

1. Read the response body as JSON. If `body.data?.__declaredError__` is absent, this is not a declared
   failure — treat it as any ordinary HTTP error.
2. If present, it must be an object with `typeof tag === 'string'` and `typeof status === 'number'`.
   If not, treat as undeclared.
3. That object *is* the variant: `tag` is the discriminant, `status` is the declared HTTP status, and
   every other key is payload defined by the endpoint.
4. `message` and `statusMessage` (v1) / `statusText` (v2) are redundant copies of `tag`. Do not
   render them to users; human copy is the client's job, keyed off the tag.
5. A tag you do not recognise is a **declared failure you do not recognise** — not a framework error.
   That distinction is exactly what the marker exists to give you.

---

## 6. Failure-mode behaviour

### 6.1 Undeclared routes

Infer **`never`** — not `unknown` (which destroys narrowing at the call site) and not a compile error.
`NitroFetchRequest` terminates in `(string & {})`, so vanilla `useFetch` accepts *any* string plus
`Request` and `URL` objects; constraining to `keyof TypedApiErrors & string` would reject external
URLs, dynamically-built paths, and the byte-identical completion list.

`never` is the honest statement — *"this route declares no failures"*, not *"this route cannot fail"*.

**Accepted cost, stated plainly:** `never` is silent. A developer using a typed wrapper on a route
that never opted in gets **no signal at all**. That is deliberate, and it is what the degradation lock
requires.

**The degradation lock, and the general rule it generalised into.** On a route that declares nothing,
every wrapper must be indistinguishable from its vanilla counterpart: same accepted argument types
(including `(string & {})`, `Request` and `URL`), same completions, same error channel. Two different
traps enforce one guard:

> **Carrying an undeclared route's `never` into *any* generic position needs an explicit
> `[Declared] extends [never]` collapse**, because `never`'s absorbing behaviour does not propagate
> outward through a wrapper type.

- `NuxtError<never>` is *narrower* than vanilla's `NuxtError<unknown>`, leaving `error.value.data`
  uninhabited (10).
- `{ ok: false, error: never }` is *inhabited*, leaving a branch that can never be taken standing (11).

Both measured. Both fixed by the same one-line guard, for unrelated reasons.

### 6.2 Unrecognised tags, and the closed union

**The declared union is CLOSED at the client boundary.** 08 offered a widening —
`Declared | { tag: string & {}, status: number }` — so a marked-but-unrecognised tag would be
representable. **Measured, it does not cost a `default` branch; it costs all narrowing:**

```
probe.ts(11,22): error TS2339: Property 'userId' does not exist on type 'Widened'.
probe.ts(13,22): error TS2339: Property 'until'  does not exist on type 'Widened'.
```

The open member disables discriminated-union narrowing for the **whole** union — `failure` stays
`Widened` inside every `case`, so no payload is reachable in any branch. The closed control in the
same file compiled clean. This removes the option rather than pricing it.

A `{ recognised: true | false }` two-level result narrows correctly but is **not computable**: §4.4
left the map type-level only, so a client holds no runtime list of a route's declared tags, and
nothing on the wire distinguishes a tag the client knows from one it does not. Only a catalogue could
— and a `server/`-only catalogue is legal, so requiring one would break a legal layout with no
compile-time signal.

Neither §3.5 nor §3.6 may reintroduce either shape.

### 6.3 The unenforced escape hatch

`fail` is not reachable from a service function three frames below the handler, so catalogue
constructors are also exported:

```ts
// server/utils/assert-owner.ts
export function assertOwner(u: User, actor: Actor): asserts actor is Owner {
  if (!isOwner(u, actor)) throw authErrors.raise('forbidden', { requiredRole: 'owner' })
}
```

**The cost, stated plainly: the escape hatch is unenforced.** A helper can throw a variant the route
never declared, and the client is typed a lie with no compile signal.

The documented rule is **"the handler body is enforced; helper modules are on you"**, and the two
spellings must be ranked explicitly in the docs rather than presented as equals. Whether this deserves
a backstop is open — see §12.

### 6.4 Version skew between server and client

Skew is **representable on the wire and unrepresentable in the types**, and that combination is
deliberate.

A server one deploy ahead sends `{ tag: "quota-exceeded", status: 429, retryAfter: 60 }`. The client's
generated union has no such member, but the marker is present and the floor holds, so a runtime reader
can say *"declared failure I do not recognise"* rather than *"undeclared framework error"*. Only the
server could supply that, and now it does.

**But the typed channel does not surface it, because §6.2 measured the only shape that could.** So:

> Under deploy skew, a tag the client does not know comes back **typed as a member it is not**, and
> reaches whatever fallback the caller wrote. `const _never: never = failure` stays compile-valid
> while being runtime-reachable.

This is the standard closed-union-over-the-wire tail. The spec states it plainly rather than pricing
it into every call site. 08's floor guarantee is not wasted — it is what makes the degraded-overload
return meaningful, and it remains the basis for any future opt-in helper (§12).

### 6.5 Production stripping, and the one place a tag escapes uninvited

**A declared failure survives production intact.** `unhandled` is assigned in exactly three places in
h3 1.15.11, and the two framework ones are guarded by `if (!isError(_error))`; `fatal` is never
assigned by framework code at all. So a deliberate `createError({statusCode, data})` throw is never
sensitive and `prod.mjs:60` keeps its `data`. Confirmed independently by two tickets.

**An *escaped callee* failure does not, and one field leaks.** If a handler uses the throwing
`$typedFetch` server-to-server and does not catch, the callee's `FetchError` escapes.
`toNodeListener` sets `error.unhandled = true` whenever the thrown value is not an `H3Error`
(`h3:2317-2320`) — and ofetch's `FetchError` is not one. Then `prod.mjs:58-60` applies
`isSensitive = unhandled || fatal`:

| Field | Fate |
| --- | --- |
| status | preserved |
| `data` | **wiped entirely** |
| `message` | masked to `"Server Error"` |
| `statusMessage` | **NOT gated by `isSensitive`** — and 08 set it to the tag |

Two things follow, one reassuring and one not:

- **The envelope cannot leak through this path.** `data` is dropped; and even unmasked it would sit at
  `err.data.data.data.__declaredError__`, one hop deeper than the reader reads. The callee's declared
  failure degrades to undeclared — the safe direction, for free.
- **The callee's internal tag *does* reach the caller's client, as the HTTP reason phrase.** The
  contract-leak worry lives in the **un**-forwarded path, which is where nobody was looking.

**The module does nothing about it, and that is a decision rather than an omission.** This is
byte-for-byte what plain `$fetch` between handlers does today — the module did not introduce it, and
the out-of-scope boundary says the module adds a lane rather than redirecting the existing one.
Normalising the throw into an `H3Error` (stops escalation, keeps the message) and converting it to an
honest 500 (strongest isolation) were both considered; both break the typings-only lock, which would
then hold on the client surface and not the server one, for a hazard that predates the module.

**What ships instead is this paragraph plus one line of guidance: prefer `.safe()` server-to-server.**

> **⟳ Measured in implementation — every row of the table above is confirmed against a real
> production build.** The prototype never ran one, so this was reasoning until now. `/api/escaped-callee`
> is a handler that lets a callee's declared failure escape: `data` is absent from the body outright,
> `message` is masked to `"Server Error"`, the status is preserved (404), and **`statusMessage` still
> carries the callee's tag** (`user-not-found`) as the HTTP reason phrase. The reader answers
> `undefined`, which is this section's *"degrades to undeclared — the safe direction, for free"*.
> Under test in `test/wire.test.ts`.

Note also that an escaped callee failure is `unhandled`, so it is logged as
`[request error] [unhandled]`, fires `captureError`, *and* escalates to the global error page — unlike
a declared failure handled normally. That is correct behaviour for a genuine caller bug. See §12.

### 6.6 Cycles and depth

**The cycle is Nitro's, and this mechanism adds nothing.** Measured three ways with the same two
handlers and the same edge, each compiled as its own program:

| variant | handlers | map |
| --- | --- | --- |
| `vanilla-only` — `$fetch` + `InternalApi`, no part of our mechanism | 6 × `TS7022`/`TS7024` | 2 × `TS2502` |
| `ours-only` — `$typedFetch` + `TypedApiErrors`, `InternalApi` empty | identical 6 | identical 2 |
| `both` — as a real project has it | identical 6 | identical 2, attributed to the **`InternalApi`** lines |

A↔B mutual calling **already cycles in vanilla Nuxt**, along the identical edge, with the identical
diagnostics. Our map cannot create an edge `InternalApi` does not already have, because `$typedFetch`
*is* a `$fetch` call. In `both`, our entries draw no diagnostic at all: putting the brand outside the
return type means `ExtractErrorsSafe` reads a *property* while `InternalApi` reads
`Awaited<ReturnType<…>>`, so Nitro's traversal closes the loop and ours is subsumed.

The fallout lands safely: the handler degrades to `any`, and §4.3's mandated `IsAny` guard turns
`ExtractErrorsSafe<any>` into `never` — an undeclared route, which is the documented silent default.

**No detection machinery ships.** Warning about a pre-existing Nitro property, in the module's own
voice, would misattribute it.

**Depth is linear and provably non-accumulating.** A→B→C where C declares `c-gone`, B calls C and
remaps to `b-upstream`, and A calls B: `EXIT=0`, each hop narrows with payloads intact, and an
`@ts-expect-error` proving `'c-gone'` is unreachable from `DeclaredErrorsOf<'/api/a'>` is consumed.

---

## 7. Compatibility and dependencies

### 7.1 The compatibility contract (17 §4)

```ts
compatibility: { nuxt: '>=4.5.0 <5.0.0' }
```

**This is a change the implementation effort must make.** Both
`packages/nuxt-handler-errors/src/module.ts:11` and `templates/nuxt-module/src/module.ts:11` still
carry the template's `>=4.0.0` — verified still true as of this writing.

The inherited `>=4.0.0` is dishonest in **both** directions:

- **The ceiling is the load-bearing half.** An open `>=` actively claims the h3 v2 / Nitro 3 line,
  which §7.3 measures as at best untested. It is also the module's *only* guard: Nuxt checks
  `compatibility.nuxt` at module setup, so it fires before any dependency machinery matters.
- **The floor moves up to what was measured.** Nothing in this map was run against anything but
  **4.5.1**. `>=4.0.0` asserted three minors nobody ran.
- **The asymmetry decides it.** Widening a range later is a patch release; narrowing one is breaking.
  Starting tight is recoverable; starting loose is not.

The template default is wrong for every future scaffold too, which is worth a separate look
independent of this module.

### 7.2 The dependency rule — and its reasoning, which an implementer will otherwise "fix"

**`h3`, `nitropack` and `pathe` are plain `dependencies` on catalog-managed caret ranges with a major
ceiling. There is no `peerDependencies` block. Do not convert these to exact pins.**

> **⟳ Measured in implementation — the list is one short: `vue` joins it, on this section's own
> reasoning.** §3.7's reactive reader has nowhere to live but `/shared`, and it imports `computed`.
> Vue's reactivity is module-global exactly as h3's augmentation binding is path-resolved: two
> physical copies mean a `computed` created in one does not track a ref owned by the other. So `vue`
> is a plain catalog-ranged `dependency` for the same instance-identity reason, not a new kind of
> exception. (`@nuxt/kit` is the fifth, and is build-time only.) Measured: a real production Nitro
> build of the playground resolves and bundles `/shared` unchanged with `vue` in it.

The reasoning is non-obvious and inverts the usual instinct:

- **What is actually at stake is *instance identity*.** §3.6's `event.$typedFetch` rides a
  `declare module 'h3'` augmentation, and module augmentation binds to a **resolved path**. Two
  physical copies of h3 means the augmentation lands on the one the consumer is not using — a
  `TS2339` with no explanation, or worse, silence.
- **Range overlap is what protects it, and it was measured favourably.** The reference install
  collapses **six** `nitropack@2.13.4` instances onto a single `h3@1.15.11` directory, because h3 v1
  declares no peers and pnpm dedupes on range overlap.
- **An exact pin *causes* the failure that pinning normally prevents.** `h3: "1.15.11"` guarantees the
  duplicate the moment Nuxt ships a patch that moves h3, because pnpm then cannot satisfy both from
  one directory.
- **`peerDependencies` was considered and rejected on pnpm's behaviour.** It would make the
  same-instance requirement declarative — but h3 and nitropack are *transitive* in a Nuxt app,
  declared by nobody, so under pnpm's default `auto-install-peers` an unmet peer is **installed**, not
  errored: a second physical copy, precisely the failure the declaration was meant to prevent.

**A consumer upgrading Nuxt underneath the module:** within 4.x, ranges keep overlapping, pnpm keeps
one h3, nothing happens — this is the case the ranges are chosen for. Crossing to Nuxt 5,
`compatibility.nuxt` fires first at module setup, before any type or runtime consequence is reachable.
That single guard is why §7.1's ceiling is the load-bearing half; without it the consumer's first
symptom would be a wire-key rename surfacing as a missing tag.

### 7.3 Forward-compatibility note: the v1 → v2 divergence table (17 §5, verbatim)

Measured, h3 1.15.11 → 2.0.1-rc.26.

| Surface | v1 | v2 | Invalidates a decision? |
| --- | --- | --- | --- |
| Error class | `H3Error` | `HTTPError`; `createError` still exported and still reads `statusCode`/`statusMessage` off details **and** off `cause` (`h3.mjs:126-128, 3211-3213`) | **No** — the write side is source-compatible |
| `toJSON()` keys | `{message, statusCode, statusMessage?, data?}` | `{status, statusText, unhandled, message, data, ...body}` (`h3.mjs:149-158`) | **Yes, cosmetically** — 08 set `statusMessage` = the tag; under v2 that copy becomes `statusText` |
| `data` reader path | `err.data.data.__declaredError__` | **unchanged** — `data` keeps its key and its position | **No** — `declaredError`, `.safe` and §3.6 all survive the rename |
| Production stripping | Nitro `prod.mjs:60`, gated `unhandled \|\| fatal` | moved *up into h3*: `data: unhandled ? void 0 : this.data` (`h3.mjs:156`) | **No** — same gate, one layer earlier |
| `fatal` | present, never assigned by framework code | removed entirely | **No** — 03 found this already |
| `unhandled` rule | set only when the thrown value is not an `H3Error` | identical: `if (!isHTTPError) error.unhandled = true` (`h3.mjs:296-301`, `1476-1480`) | **No** — 03's "expected error" convention is forward-compatible, as 03 predicted |
| New `body` field | — | spread into `toJSON` at top level when not unhandled | No — a new escape hatch the module does not need |
| Validation status | 400 | 400 | **No** |
| Handler validation | none | `defineValidatedHandler`, **`@experimental`** in its own JSDoc, unusable per 17 §1 | **No** |

**Net: exactly ONE consumer-visible divergence on the wire** — the redundant second copy of the tag
moves from `statusMessage` to `statusText`. The load-bearing envelope, `data.__declaredError__`, is
untouched, which means 08 froze the right thing.

**What is NOT enumerated, and why.** Nitro 3's error serializer, `isJsonRequest`, `localFetch` and
`fetchWithEvent`'s header merge — and above all **whether Nitro 3 still emits `nitro-routes.d.ts`
with the same `InternalApi` shape and still fires `types:extend`, which is §4's entire mechanism** —
are unmeasured and stay that way. No Nitro 3 is reachable on any tree. This is a **known unknown**,
not an oversight.

### 7.4 The validation adapter is permanent (17 §1–§3, amending 13 §9)

13 designed the Standard Schema adapter to be deletable if h3 v2 provided a native replacement. 17
measured `h3@2.0.1-rc.26` and found there is **nothing to delegate to**:

- **`params` does not exist.** `defineValidatedHandler.validate` accepts `body`, `headers`, `query`
  only. §3.3 ships `body`, `query`, `params`.
- **Query output is coerced back to string, by construction.** `url.searchParams.set(key, value)`
  (`h3.mjs:610-614`), and the type surface confirms the intent:
  `query: StringHeaders<InferOutput<Q>>`. A `z.coerce.number()` query field types as `never`. §3.3's
  "already parsed" typed `query` is **unrepresentable** through v2's handler.
- **Body validation is a lazy `Proxy`** over `req.json()` that throws `TypeError` on
  `.text()`/`.formData()`, and **each source fails fast independently** — killing §3.3's
  report-everything-at-once.
- **The thrown `data.issues` is the raw Standard Schema array with no `location`.** That exists only
  as `_source` passed into a caller-supplied `onError`, so recovering it means rebuilding this
  envelope through an indirection — which *is* the normalisation code, re-entered.
- **The util-level path saves zero lines** over `schema['~standard'].validate(value)`, and its
  `onError` receives a bare `FailureResult` with **no `_source` at all**.

So the seam never gets swapped. **No code moves; no version branch ships; runtime feature-detection
stays rejected** (two paths that must produce byte-identical `path` arrays are untestable in one
install, and the divergence would surface only inside a consumer's Nuxt upgrade). Read 13's "designed
to be deleted" as **"costs nothing either way"** rather than as a scheduled removal.

---

## 8. Packaging

### 8.1 Any type in an exported runtime signature is public API

`@nuxt/module-builder` **does not bundle `src/runtime/`** — mkdist transforms each file individually
with an extracted `.d.ts`. So a third-party type appearing in an exported runtime signature ships as a
bare import that every consumer inherits, along with its TypeScript floor and major-version churn.

This is wider than it first looks, and it was measured: the emitted `.d.ts` of a *catalogue* is
`ErrorCatalogue<VariantsOf<{…}>>`, **unevaluated** — so `ErrorCatalogue`, `VariantsOf` and `Payload`
ship to consumers alongside `TypedEventHandler`, and a catalogue published from a Nuxt layer or npm
package drags them too. `DeclaredErrorsOf` and `Flatten` ship the same way through `.safe` — as
`SafeResultFor` and `TypedResult`, which §3.5's amendment explains and which is why both names live
on `/types` rather than being private to the wrapper.

Consequences already applied throughout this spec: the Result library was ruled out partly on this
(04); the declaration surface carries no flattening alias it does not need (07); `/types` carries the
whole public type surface (15); and a `/runtime/*` wildcard export was rejected because it would make
every file under `dist/runtime/` public API.

**Confirmed across a real package boundary** (09 §6): catalogues authored in
`playground/shared/errors/*.ts` importing `@dphonys/nuxt-handler-errors/shared` by its real published
specifier, consumed by a generated `.d.ts` in a *different* package's build directory — the
unevaluated `ErrorCatalogue<VariantsOf<{…}>>` resolves and the union comes out intact with literal
statuses.

### 8.2 Five packaging facts from the prototype (09 §5)

None change a design decision; each will otherwise cost the implementation effort a session.

1. **`{}` is load-bearing twice and trips this repo's lint.** `VariantsOf`'s payload-less branch and
   `ConflictGuard`'s no-conflict branch both need `{}` as the identity element for `&`. Both need an
   inline `eslint-disable-next-line ts/no-empty-object-type`.
2. **The `/types` specifier cannot be purely ambient.** A non-exported
   `declare const … : unique symbol` **does not survive declaration emit** from a published entry
   point. Use real `Symbol()` values; hovers are unchanged.
3. **`h3`, `nitropack` and `pathe` become real dependencies**, and this repo's
   `pnpm/json-enforce-catalog` rule requires them in the workspace catalog. (Ranged — §7.2.)
4. **`nuxt-module-build --stub` is incompatible with the `./types` and `./shared` subpath exports.**
   `--stub` does not emit stub files — it **replaces `dist/runtime` with a symlink to `src/runtime`**,
   and `exports["./shared"]` points into `dist/runtime/`. **The package's `dev` script needs
   revisiting**; run `nuxt dev playground` against a real build instead.
5. **`test` needs the package's own `build`, not just `^build`**, because the e2e fixture is the
   playground consuming the module through its published specifier. A package-level `turbo.json` with
   `test.dependsOn: ["build"]` closes it.

Two further observations from the same session, worth carrying:

- **A rebuild does not reliably orphan-collect `dist/runtime/`.** After source files were removed, a
  full `pnpm check` rebuilt some outputs but left four orphaned ones in place with their original
  mtimes. The mechanism was not chased. It matters because `publint` packs `dist`, so a deleted
  runtime file can keep satisfying an `exports` entry that no longer has a source. **`rm -rf dist`
  before trusting a build.**
- **The export map must be written.** The scaffolded `package.json` ships `.` only; `exports` **and**
  `typesVersions` both need the `/types` and `/shared` entries. That edit belongs to the
  implementation effort, and **ticket 20 (teach knip about `packages/*`) is blocked on it** — correct
  knip entry points *are* that list.

### 8.3 Hover legibility is a declaration-shape property, and three measures are mandatory

Illegible inferred types are a genuine failure of this design, not a cosmetic complaint. Prototype item
6 **failed on first contact** while the entire positive assertion suite was green — the type is
structurally identical either way — which is why these are mandates and why they are tested as
*rendering* assertions (§9.3).

**(a) Flatten the union before forwarding it into another generic.** 07's "no flattening alias is
needed" holds only when the union is **indexed out of** the emitted map. Passed on as a *type
argument* — which is what any `NuxtError<Declared>` or `TypedResult<T, Declared>` declaration does —
`Simplify<Serialize<…>>` stays unevaluated:

```
NuxtError<DeclaredErrorBody<Simplify<SerializeObject<{ tag: "user-not-found"; status: 404; }
  & { userId: string; }> | SerializeObject<{ tag: "user-suspended"; status: 403; } & { until: string; }>>>>
```

A distributive identity mapped type forces evaluation before it enters the outer generic:

```ts
type Flatten<T> = T extends unknown ? { [K in keyof T]: T[K] } : never
```

```
NuxtError<DeclaredErrorBody<{ status: 404; tag: "user-not-found"; userId: string; }
                          | { status: 403; tag: "user-suspended"; until: string; }>>
```

> **⟳ Measured in implementation — the mandate stands and its *position* is now exact: write
> `Flatten` inside the wrapper alias's own body, never as the type argument handed to it.** This was
> the single most contested measurement of the effort; three tickets measured it from three positions
> and only the third had the position where the difference is reachable. Against the **real
> playground map**, rendering `NonNullable<typeof typed.error.value>` through `useTypedFetch`:
>
> | where `Flatten` is written | rendered | shape |
> | --- | --- | --- |
> | inside `TypedErrorRef`'s body — **shipped** | **212** | flat, exactly the worked example above |
> | nowhere | **371** | `Simplify<SerializeObject<…>>` residue |
> | passed in as `TypedErrorRef`'s `Declared` argument | 380 | residue, **one name longer** |
>
> Row 3 is what the two earlier tickets measured, and it explains rather than contradicts them.
> `TypeFormatFlags.InTypeAlias` expands the **top-level** type only, so `Flatten` written where the
> printer can still see its own alias — as a type *argument*, or by hand in the annotation being
> rendered — is echoed as `Flatten<Simplify<…>>` and costs a name. Written **inside the alias body**
> the checker resolves it during instantiation and there is no alias left to echo. Neither earlier
> position could reach the difference: the extractor had no wrapper alias to put it in, and §3.7's
> reader is a *path* rather than a declaration, so its return renders flat (182) with or without it.
> §3.5's `.safe` confirms it from a third position at 273 / 432 / 333, where the argument spelling
> costs an *extra* name because a mapped type over a constrained parameter has to be written
> `Flatten<…> & AnyVariant`.
>
> **The `T extends unknown` in the alias is redundant, and is kept.** `{ [K in keyof T]: T[K] }` over
> a naked type parameter is a *homomorphic* mapped type and distributes over a union on its own;
> removing the conditional changes nothing measurable. Kept because this section fixes the spelling
> and it is harmless — and a genuinely non-distributive rewrite (`Pick<T, keyof T>`) does merge the
> union, which the extractor's assertions bite.
>
> **One position this mandate cannot reach.** §3.7's reader returns `E | undefined`, which makes the
> *union* top-level and the map's `Simplify<Serialize<…>>` a nested alias: the un-narrowed hover on
> the reader's call expression is **353** chars of residue, and no spelling of the reader changes
> that. The hover a caller consults *while writing the switch* — `NonNullable<…>`, i.e. inside
> `if (failure)` — is **182**, flat, tags and payloads inline. The legibility table below grades the
> narrowed one, and earns it.

**(b) Declare every composable and callable as a named `interface`, with the value a const of that
type.** Measured: **1075 chars** as a bare `function` declaration, **55** as a named interface.
Vanilla `useFetch` is 94 for exactly this reason — Nuxt declares `UseFetch` as an interface and
`useFetch` as `declare const useFetch: UseFetch`. Nitro declares `var $fetch: $Fetch` the same way.
**The overload count does not reach any hover**, because a named interface renders as its own name —
so §3.4's five overloads cost legibility nothing.

**(c) An array-valued payload field must be a NAMED interface.** This **inverts** the usual
preference for anonymous payload literals. Nitro's `Simplify` is `TType extends any[] | Date ? TType
: {…}` — it **short-circuits on arrays** — so any payload array keeps its `Serialize` residue in the
hover and never expands. Naming the element type renders `SerializeObject<ValidationIssue>[]` with a
**clickable name**; the fully-inline spelling renders expanded noise inside the *same* unevaluated
wrapper. Rendering only — the type is structurally exact either way. This binds every future payload
with an array field, not only §3.3's `issues`.

> **⟳ Measured in implementation — the mechanism and the direction reproduce exactly; the numbers are
> 54 and 125, not 93 and 149.** Both spellings of the same field, side by side in one program, on
> `test/types/pos/validation.ts`:
>
> | spelling | rendered | text |
> | --- | --- | --- |
> | `ValidationIssue`, a named interface — **shipped** | **54** | `import("nitropack").SerializeObject<ValidationIssue>[]` |
> | the same three fields written inline | **125** | `import("nitropack").SerializeObject<{ location: 'body' \| 'query' \| 'params'; path: (string \| number)[]; message: string; }>[]` |
>
> Nitro's `Simplify` short-circuits on arrays, the residue is unavoidable, and the only thing
> deciding legibility is whether the element type has a name to render. §9.3's budget follows the
> shipped numbers, not these ones — see there. **The inline spelling stays in the fixture
> permanently** and the test asserts it blows the budget, so the mutation that would break this
> mandate is committed rather than something a future reader has to reproduce.

**Where legibility lands, judged (10 §4):**

| What the user hovers | Rendered | Verdict |
| --- | --- | --- |
| the composable | `UseTypedFetch` — 55 chars (⟳ **64** as shipped) | ✅ vanilla is 94 |
| `data.value` | the flat success object | ✅ identical to vanilla |
| `error.value` | `NuxtError<DeclaredErrorBody<{…} \| {…}>>` — ~250 chars | ⚠️ honest, envelope-shaped |
| **the reader's return** | the flat variant union | ✅ **this is what callers read** |

`error.value`'s hover is the one imperfect surface, and it is imperfect *because it is honest* — the
envelope is genuinely what the ref holds. The reader is what makes that acceptable: it moves the
user's attention onto the flat hover, which is the one they consult when writing the `switch`.

> **⟳ Measured in implementation — the table is right about `error.value`, one row behind on the
> composable, and generous about the `error` ref.** The composable renders **64** as shipped, not 55:
> 55 was the prototype's pair on a smaller signature, and the shipped one has all five overloads.
> The verdict is unchanged — the bare `function` spelling of the same declaration is 560, with only
> *one* overload written out. `error.value` measures **212** against its *"~250"*. The `error` **ref** — one hover
> higher, on the destructured name rather than on `.value` — renders **904**, because Vue 3.5
> declares `Ref<T, S>` with two parameters and the envelope is printed into both. Nothing about the
> declaration changes that; it is worth knowing before hovering. The reader's return is **182**
> narrowed and **353** un-narrowed, per §8.3(a)'s note. `.safe`'s result object, which on that
> surface is the hover a caller lands on first, is **273**.

---

## 9. Compile-time testing strategy

The entire value proposition is compile-time, so ordinary Vitest assertions prove almost nothing.
Everything below lands in `vitest run` and `vue-tsc` — i.e. in `pnpm check`. **No new test tier, no
nightly, no manual release checklist, and no fixture Nuxt app beyond the playground that already
exists.**

### 9.0 The enabling measurement

`ts.createProgram` + `ts.getPreEmitDiagnostics`, imported from this repo's pinned
`typescript-native-bridge@6.0.3-bridge.8.tsgo.7.0.2`, returns real diagnostics with **code and
flattened message text**. The bridge is *"a drop-in `typescript` whose type checker runs in-process on
tsgo via the NAPI bridge"* — so a compiler-API harness is **not stock tsc in disguise**. It is the
gate's own checker, reached programmatically. Every decision below rests on this.

> **⟳ The identity survives the bridge's removal (§9.8's second ⟳ note).** The workspace
> `typescript` is now stock TypeScript 5, and the same import is therefore still the gate's own
> checker reached programmatically — the property this section establishes — with the harness now
> being stock tsc *openly* rather than needing the defence.

### 9.1 The layers — four as designed, ⟳ five as shipped

| # | Layer | Fixture | Runs under | Cost | Uniquely catches |
| --- | --- | --- | --- | --- | --- |
| 1 | lookup types, `neg/`, hovers | hermetic — hand-written maps, no Nuxt | `vitest run` | ~seconds | every type-level guarantee; the only layer that can assert a *rendering* |
| 2 | the emitter | `(handlers, opts) => string`, called directly | `vitest run` | ~ms | path-referentiality; Option 2 not rotting |
| 3 | consumption-side positives | the **real playground**, against actual generated `.nuxt/types/*.d.ts` | `vue-tsc` in `typecheck`, **⟳ plus two `nuxt prepare` builds in `vitest run`** | already the `typecheck` script, **⟳ +~3.5 s** | that the map binds in all three programs, and its route keys |
| 4 | the wire | playground e2e, `@nuxt/test-utils/e2e` | `vitest run` | needs `build` | that the envelope actually crosses the wire |
| **⟳ 5** | **the wrappers' own runtime** | `#app` aliased to a recording double | `vitest run` | ~0.2 s | §3.8's header merges, per input shape, with nothing booted |

**Layer 3 is non-negotiable**, and is why hermetic-only was rejected. Layers 1 and 2 carry the great
majority of the assertions.

> **⟳ Measured in implementation — four corrections to this table, all of them costs this section
> did not budget for.**
>
> - **Layer 3 does not catch `types:extend` ceasing to fire, because the gate never runs the mode
>   where it matters.** Measured: deleting the `nitro.hooks.hook('types:extend', …)` re-render
>   entirely leaves `nuxt prepare`'s output byte-identical and every layer-3 assertion green.
>   `nitro:init` fires before the type templates are first rendered, so the closure is already
>   populated and the first render is already complete — the forced re-render buys **regeneration on
>   route change in dev** and nothing else. The claim is true of layer 3's *fixture* (only a real app
>   can see the binding at all) and false of its *build mode*. The deletion half is since asserted
>   structurally: `test/module-setup.test.ts` fires `types:extend` on the Nitro instance captured
>   from a real `loadNuxt` boot and holds the answer to one re-render request filtered to exactly
>   the map template, so dropping the registration is a red test rather than a byte-identical
>   build. What stays dev-race-only is the *upstream* half — a Nuxt or Nitro bump making
>   `types:extend` stop firing at all is observable only from a live dev server, and §9.6 leaves
>   `pnpm dev-race` ungated — which is the reason the two diagnostic scripts ship rather than being
>   written down. The column above is rewritten to what layer 3 does catch.
> - **Layer 3 needs a second surface inside `vitest run`.** Three claims are not expressible under
>   `vue-tsc`: the emitted file's **route keys**, its **byte identity across a catalogue content
>   edit** (which needs a second build of an edited app), and the `paths` entries the `hoist` push
>   writes. `test/generated-map.test.ts` runs two `nuxt prepare` builds over **byte copies of the
>   playground's own sources** — not a new fixture app, which §9 forbids — at ~3.5 s total, and
>   compiles a probe against the result through the layer-1 harness. The `vue-tsc` half stays where
>   this section puts it, and the package's `typecheck` script now runs
>   `playground/server/tsconfig.json` as well, which is the only program that proves
>   `addTypeTemplate`'s `nitro: true`.
> - **A fifth layer exists, for the wrappers' own runtime.** `useTypedFetch` imports `useFetch` from
>   `#app`, so it cannot be loaded under a plain `vitest run` at all, and §3.8's header merge would
>   otherwise be reachable only through a full e2e build — one build per input shape, to check what a
>   merge does with a tuple array. `vitest.config.ts` aliases that one specifier to a recording
>   double. It is a genuine fifth surface: not hermetic *types*, not the emitter, not `vue-tsc` and
>   not the wire. §9's *"no new test tier"* is about tiers needing their own runner or their own
>   fixture app; this needs neither.
> - **Layer 4 is at sixteen tests against this section's budget of six**, and every addition is
>   recorded rather than defended: §6.5's production stripping and the escaped-callee path (+2, and
>   observable *only* against a production build, which the prototype never ran); the composable's
>   auto-import registration and its header merge (+2, the latter being the only observation of §3.8
>   that exists, and it brought the route outside `/api/**` this section budgets for and which had
>   never been added); the global reaching a client call site and a Nitro handler (+2); the
>   context-forwarding probe with the global beside it as its own control, and the three-hop chain
>   (+2); and one hostile `/api/signup` request wrong in four ways at once plus its success
>   counterpart (+2, because nothing else in the repo runs a **real Standard Schema library against a
>   real built server**, which is the whole of §3.3's *"zod, valibot and arktype work untouched"*).
>   The coverage-gaps effort later added the `event.$fetch`-replacer composition probe with its
>   direct-call control (+1): a playground fixture plugin (`server/plugins/fetch-replacer.ts`)
>   replaces `event.$fetch` in a `request` hook registered after the module's — scanned
>   `server/plugins` are pushed after `addServerPlugin`'s entries — and the marker surviving the
>   probe's internal hop is the only runtime observation of §3.6's thunk claim; capturing
>   `event.$fetch` at hook time instead is a red test (mutation run). This gap had been classed
>   *"observable only in a browser"*, wrongly: `event.$typedFetch` is a server-side member and the
>   composition crosses plain server HTTP. (The signup pair has since left with the validation
>   trim, whose policy was to leave this record untouched; measured on disk after both, the two
>   e2e files hold eighteen tests.)
> - **This section has no wall-clock budget, and layer 1 has spent the one Vitest gives it by
>   default.** The declaration-emit test builds two whole TypeScript programs; alone it runs in ~3 s,
>   and with §3.3's types in the graph it walks and the file suite saturating eight workers it
>   reached ~7 s — past Vitest's 5 s default, as a **timeout**, which reads as a broken assertion
>   rather than as a busy box. Shipped is an explicit `60_000`. Worth knowing before adding the next
>   compile-heavy layer-1 file: the suite's cost is shared, and the default timeout is the thing that
>   notices first.

### 9.2 The twelve committed `neg/` fixtures

`test/types/neg/*.ts`, **one `ts.createProgram` per file** — preserving the compile-alone mandate so
diagnostics do not mask each other — asserted on **diagnostic code plus a message substring**.

| Guarantee | Fixture | Asserted |
| --- | --- | --- |
| undeclared tag in `fail()` | n1 | `TS2345`, message names the declared tags |
| duplicate tag across composed catalogues | n2 | `TS2345`, message carries the colliding tag |
| explicit type argument on the handler | n4 | **`TS2558`** — never a silent `any` |
| `.pick()` of an unknown tag | n8 | `TS2345`, message lists the real tags |
| identical duplicate must compile CLEAN | n3 | **zero diagnostics** |
| payload shape / arity | n5, n6, n7 | `TS2322`, `TS2554`, `TS2554` |
| `schema.safeParse` (h3's own footgun spelling) | 13/n1 | `TS2322` |
| plain-function validator | 13/n2 | `TS2322` |
| undeclared validation location | 13/n3 | `TS2339` |
| unfillable `invalid-input` payload | 13/n4 | `TS2345` naming `__invalidValidationPayload__` |

**§3.2's guard-first mandate IS tested**, via a substring assertion on the rendered diagnostic:

```ts
it('guard-first keeps the colliding tag visible', () => {
  expect(text(compileAlone('n2-tag-conflict.ts'))).toContain('forbidden')
})
```

Yes, this couples the suite to TypeScript's truncation length. **That coupling is the test.** A
compiler bump that truncates the tag away has genuinely broken the mandate, and a red test is the
correct outcome. Diagnostics are truncated *at creation time*, so guard-last renders `… & { ......'`
and the assertion fails — which is exactly right.

> **⟳ Measured in implementation — the assertion is the *property name*, not only the sentence, and
> the list is longer than twelve.** §3.3's `ValidationShapeGuard` mirrors `ConflictGuard`, and the
> first assertion written for it matched only the guard's rendered sentence — which a guard-last
> regression can still render. The half only guard-first puts at the head of the parameter is the
> **property name**, which is what the table's `__invalidValidationPayload__` row names. Both are
> asserted now, and the mutation was taken: moving `{ errors: C; body?; query?; params? }` in front
> of the two guards fails **both** neg fixtures at once, which is the same truncation this section
> records. Fifteen `neg/` fixtures ship rather than twelve — the three extra cover `event.$fetch`'s
> namespace not growing `raw`/`create`, and `.safe`'s two narrowing obligations (an unbranched `data`
> read, and a payload read without narrowing on `tag`) — plus three more that are the harness's own
> self-tests rather than surface claims.

### 9.3 Hover legibility survives as length budgets

All three §8.3 mandates become assertions in the same harness, rendered with
`TypeFormatFlags.NoTruncation` and asserted on **rendered character length**:

```ts
const BUDGETS = [
  { name: 'useTypedFetch',  max: 150 }, // ⟳ measured  64 good /  560 bad
  { name: 'H_error',        max: 260 }, // ⟳ measured 212 good /  371 bad
  { name: 'H_invalidInput', max:  85 }, // ⟳ measured  54 named / 125 inline  (was 120)
  { name: 'safeResult',     max: 340 }, // ⟳ added: measured 273 good / 432 bad
]
```

> **⟳ Measured in implementation — three of the four numbers are re-taken, one budget is added, and
> one companion guard is deliberately omitted.**
>
> - **`useTypedFetch max: 150` ships as written.** Measured 64 as a named interface against 560 as a
>   bare `function` declaration with only *one* of the five overloads written out.
> - **`H_error max: 260` ships as written**, measured 212 good / 371 bad — but 1.75× is thin by this
>   section's own 2–20× standard while the shape difference is categorical, so it ships with a
>   `not.toContain('SerializeObject')` beside it. The same pairing is used for `safeResult`, where
>   1.58× is thinner still.
> - **`H_invalidInput` is 85, not 120.** The mechanism and the direction reproduce exactly (§8.3(c));
>   only the absolute numbers differ, and this section's own rule — *"budgets sit ~1.5× the measured
>   good value"* — gives 85 from 54. The spec's 120 would sit at 2.2× the good value and leave five
>   characters between itself and the failing spelling. **`not.toContain('SerializeObject')` would be
>   wrong on this one**, and the test says so: the residue is exactly what §8.3(c) concedes is
>   unavoidable on an array, and *the name inside it* is the whole claim.
> - The budgeted symbols are `_hoverX` rather than this section's `H_x`, because the repo's lint
>   requires an unused declaration to be `_`-prefixed.
> - The *narrowed* `.safe` position (`Extract<typeof safe, { ok: false }>['error']`) renders 182 flat
>   **with or without `Flatten`** and is asserted on shape only, with no budget — it is top-level
>   there, and §8.3(a)'s printer rule expands a top-level alias whatever it is made of.

Character count is the metric all three were actually decided on, and it is far more stable than the
exact string — cosmetic churn moves it a few percent, a real regression moves it 2–20×. Budgets sit
~1.5× the measured good value with the measured pair in a comment, so a failure reads as *"the Flatten
mandate broke"*.

**The decisive argument:** the prototype's item 6 failed while the entire positive `Expect<Equal<…>>`
suite was green, because the type is structurally identical either way. A structural assertion is
**constitutionally blind** to this regression class. If it is to be protected at all, it must be a
*rendering* assertion.

### 9.4 Layer 2 and the emitter

See §4.6 — the factoring mandate is a shape constraint on the implementation, restated there.

### 9.5 Assertion vocabulary, and the `never`/`any` trap

```ts
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
type Expect<T extends true> = T
type IsAny<T> = 0 extends (1 & T) ? true : false
```

The conditional-identity `Equal` is the one helper `any` cannot fool. Three rules bind every assertion:

1. **Use `IsAny` explicitly** wherever *"must not be `any`"* is the real claim (01a's collapse trap).
   `Equal<X, SomeType>` passing is not proof, since the naive mutual-assignability helper passes with
   `X = any`.
2. **Tuple-wrap every never-check** — `[X] extends [never]`, never bare `X extends never`, which
   distributes over `never` and is vacuously true. This mirrors the collapse §6.1 mandates in the
   *source*; the suite must not use a weaker form than the code it tests.
3. **Positive fixtures assert ZERO diagnostics.** Without this a fixture that stops compiling for an
   unrelated reason passes vacuously — the classic way a type-test suite goes green while proving
   nothing.

### 9.6 The dev-server race gets no timing test

It is safe **structurally**, not statistically: `MatchedRoutes` derives its key universe from
`keyof InternalApi`, so a key our map has and Nitro's does not is *unreachable by construction* —
which is why 09 measured `misattributed: 0` rather than merely "few". That property is testable
hermetically at layer 1:

```ts
// map declares '/api/ghost'; InternalApi does not
type _unreachable = Expect<Equal<MatchedRoutes<'/api/ghost'>, never>>
```

`dev-race.ts` / `dev-race-direction.ts` ship as an **ungated `pnpm dev-race` diagnostic** for when a
Nuxt or Nitro bump is suspected. §4.5's table and the `:1441`-fires / `:1442`-writes mechanism are the
evidence. A gated timing test is flaky by construction — a persistent dev server inside `pnpm check`
is the first thing disabled on a loaded CI box.

### 9.7 What is deliberately NOT protected

Stated plainly, because inheriting a silent gap is worse than inheriting a known one.

1. **IDE completion lists.** The `TS2345` *message* naming the allowed tags **is** asserted (§9.2).
   Actual completions are a language-service surface (`getCompletionsAtPosition`) and nothing asserts
   them. Upgrade path if ever wanted: `ts.createLanguageService` over the same fixture files — the
   same harness, one more entry point.
2. **Stock-tsc behaviour** — see §9.8. **⟳ Dissolved entirely in the bridge-removal effort: stock
   TypeScript is now the workspace compiler, so everything the gate compiles is stock behaviour by
   construction.**
3. **Dev-server wall-clock timing** — the invariant is tested, the clock is not (§9.6).
4. **Editor experience beyond rendered strings** — go-to-definition, quick-info layout, error squiggle
   placement. Out of reach of any harness this repo would maintain.
5. **⟳ Nuxt shipping and executing a registered `mode: 'client'` plugin in a real browser.** Both
   deletion modes of the client `$typedFetch` plugin are asserted without one (§3.5's
   implementation note), so a browser tier's whole yield would be upstream's own contract. The
   rejection was re-evaluated rather than assumed, and this section's original terms are not what
   carries it: the candidate path — `browser: true` on the *existing* `@nuxt/test-utils/e2e`
   `setup()` — is the same runner and the same fixture app the "no new test tier" rule names, so
   nothing above bars it. What stands is the price: a `playwright-core` devDependency, a Chromium
   download in CI, and real-browser flake exposure, none of it worth that thin residual in the
   gate. No ungated browser diagnostic either — same thin residual, same dependency weight.

### 9.8 Compilers: the pinned bridge only, and the consumer gap

The suite runs under **the pinned tsgo bridge only**, because `pnpm check` is the canonical gate and
the gate's compiler is the contract.

The symmetric half is real and is **ruled out of scope** (§10.4): downstream projects cannot be
assumed to be on tsgo, and the emitted `.d.ts` is compiled by stock TypeScript at every consumer, so
nothing in the gate proves what a consumer actually experiences.

Consequences, recorded rather than hidden:

- The suite is **blind to the divergence class** research 02 measured (§10) — which is also the trigger
  condition for §10.2's fallback.
- **Nothing proves the surface on the compiler consumers actually use.** The implementation effort
  inherits this as an explicit risk.

**One cheap mitigation is designed in and costs nothing today: the harness takes its `ts` module as a
parameter** rather than importing it at top level. A future stock-tsc run is then a
`describe.each([bridge, stock])` plus one aliased devDependency — no harness rewrite. Deliberately not
wired up now.

> **⟳ Wired in the coverage-gaps effort — the mitigation paid out exactly as designed.** Every
> `createTypeHarness` suite (`test/types/*`, the emitted-map suite, and the generated-map suite
> against the real prepared app) is now a `describe.each` over both compilers
> (`test/types/compilers.ts`). The stock row is the aliased `typescript-stock` devDependency
> (`npm:typescript@^5`, floating on purpose — a stock minor breaking the suite is the divergence
> signal this row exists for; pnpm overrides key on the dependency alias, so the workspace-wide
> bridge override never touches it) and joins via an env flag `pnpm test` sets, so CI always runs
> both while `test:watch` stays on the bridge. The divergence class this section declared itself
> blind to was real and is now *asserted*, not exempted: expectations carry a per-compiler `stock`
> override at the call site (measured: TS2741→TS2344 on `neg/unserializable-payload.ts`; union
> members ordered alphabetically on the bridge, declaration-order on stock; annotation-written
> literals single-quoted on the bridge, double-quoted on stock). Hover budgets survive both
> compilers by canonicalizing the `import("…")` specifier to a fixed token before measuring —
> stock renders absolute checkout-specific paths there — after which every budgeted render
> measures byte-identical under both. Cost, measured at wiring: `pnpm test` 18s → 63s wall; the
> generated-map suite 7s → 18s, its `nuxt prepare` builds shared across rows. §9.7 item 2 and
> §10's "neither observation is now under test" are both narrowed by this: stock-tsc behaviour of
> everything the harness compiles *is* now under test, and only the `vue-tsc` typecheck step
> remains bridge-only (§12.1's repo-tooling item, unchanged).

> **⟳⟳ Reversed in the bridge-removal effort: the bridge is gone and stock TypeScript is the
> workspace's one compiler.** The dual-row era above closed the consumer gap but at a standing
> cost — a hand-pinned prerelease no caret could advance, a workspace-wide override the
> `typescript-stock` alias had to tunnel under, per-compiler expectation overrides at call sites,
> and a gate that paid for both rows on every run. The reversal collapses all of it: the
> workspace `typescript` is `npm:typescript@^5` (caret floating for the same divergence-signal
> reason, now delivered by Renovate), every suite runs one row through a plain `import ts from
> 'typescript'`, `CompilerDialect`, the `stock` expectation override and the
> `NUXT_HANDLER_ERRORS_STOCK_TS` flag are deleted, and `test/types/compilers.ts` no longer
> exists. The measured divergences resolved into base expectations (TS2344 on
> `neg/unserializable-payload.ts`, declaration-order unions, double-quoted literals). What the
> era leaves behind on its own merits: the harness still takes `ts` as a parameter, and hover
> budgets still canonicalize `import("…")` specifiers — stock's absolute checkout-specific paths
> are why. The `vue-tsc` step now runs stock too, closing §12.1's repo-tooling caveat. What is
> given up, knowingly: nothing checks this package on tsgo anymore; the day the ecosystem moves
> to TypeScript 7 native, that is a fresh evaluation rather than a maintained row.

### 9.9 Six implementation traps handed forward (18 §9)

Each was hit by a probe session and would otherwise cost an hour.

1. **`neg/` fixtures must be excluded from the package's `tsconfig` `include` AND from eslint.** They
   are deliberately non-compiling; left in the program they fail the `typecheck` step. The harness
   passes explicit `compilerOptions` per file regardless.
2. **`Expect<Equal<…>>` consts must dodge this repo's lint** — prefix throwaway consts with `_` for
   `unused-imports/no-unused-vars`, and mind `ts/explicit-function-return-type`.
3. **Prose *about* `@ts-expect-error` must not contain the directive.** TypeScript parses it wherever
   it appears, so a comment *describing* one becomes a real unused directive and fails with `TS2578`.
4. **The compiler API must be handed `parsed.fileNames`, i.e. the whole program.** The first hover
   attempt passed only the target file and **every lookup silently came back `unknown`/`any`** — a
   vacuously-passing harness. The generated `.nuxt/types/*.d.ts` augmentations must be present.

   > **⟳ Measured in implementation — this trap is understated in exactly the way that matters.** A
   > starved program does not yield `any`. It yields a plausible, *budget-sized residue* that sails
   > through a length budget and reads as a pass. **The primary guard must be "the fixture did not
   > compile clean"; the `any` check is secondary.**
5. **Layer 4 needs the package's own `build`, not `^build`** — the e2e fixture consumes the module
   through its published specifier. The package-level `turbo.json` closes this; note it also puts a
   build in front of the fast layer-1 tests, accepted rather than split into a second script.
6. **`--stub` is unusable** (§8.2 item 4), so no layer may rely on it.

**⟳ Six more, each hit during implementation and each worth the same hour to whoever meets it next.**

7. **A fixture that augments `InternalApi` or `H3Event` must be kept out of the package's own
   `tsconfig` `include`.** A module augmentation is global to whatever program contains it, so one
   extra route key silently changes the cost of every other file — measured: a single-key fixture was
   enough to turn a plain `$fetch('/api/users/42')` elsewhere in the suite into `TS2321 Excessive
   stack depth`, in `MatchedRoutes`' scoring conditional. Four such fixtures ship and all four are
   excluded and compiled alone by the harness. This is *also* what lets §6.1's degradation lock be
   stated as *"byte-identical to vanilla"* and meant literally: the route interface in the package's
   own program is empty.
8. **`Uppercase<AvailableRouterMethod<R>>` with an unresolved `R` trips `TS2321` in any program whose
   `InternalApi` has more than a handful of keys — and vanilla's own `Method` constraint is exactly
   that expression.** Measured twice: six diagnostics against the playground's generated types, four
   against the package's own. Nuxt writes the same expression and gets away with it because it ships
   in a `.d.ts`, which `skipLibCheck` excuses — and every Nuxt-generated tsconfig sets it, as does
   this module's emitted copy. There are **three doors** into it, and each has a different fix:
   re-declaring the alias in checked *source* (fix: don't, or keep the program's `InternalApi`
   small); a **defaulted type parameter with a constraint** on a *call signature*, whose default is
   checked eagerly at the declaration (fix: move it to a type *alias*, §3.5); and a handler whose
   return type is *inferred* from a fetch call (fix: an explicit return annotation, §6.6's cycle).
9. **A variable *annotation* on a typed fetch call is a fourth door, and it fires with the enclosing
   handler already annotated.** `const forwarded: Echo = await event.$typedFetch('/api/context-echo')`
   gives **twelve** `TS2321`, one per `InternalApi` key, in a handler whose own return type is
   explicit; dropping the `: Echo` is clean in every program. The contextual type keeps `R`
   unresolved while `NitroFetchOptions<R>`'s method expression is walked. **The practical rule is one
   line: let a typed fetch's result infer; assert its shape somewhere other than on the call** — pass
   it to a function whose parameter is the expected shape, which costs nothing.
10. **A hermetic fixture that types a *call* needs `lib.dom`, or everything it claims is vacuous.**
    This is trap 4 through a different door. ofetch's `FetchRequest` is `RequestInfo | URL`, both of
    which live in `lib.dom`; under a `lib: ["ESNext"]` fixture config they resolve to nothing,
    `skipLibCheck` swallows the diagnostic, and `NitroFetchRequest` renders as `any`. A route literal
    then infers as `any`, and `await $fetch('/api/users/123')` comes back **`unknown`** in a program
    whose `InternalApi` really does carry that route — while `MatchedRoutes` and
    `TypedInternalResponse` are both *correct* in the same program, which is why the lookup and
    reader fixtures never noticed. Shipped is a second fixture config (the base plus `DOM`) rather
    than widening the base nine other fixtures were written against.
11. **The harness's quoting note is half the rule.** Rendered types quote string literals with single
    quotes — that holds for a literal *written in a type annotation*. A literal the checker
    **synthesised** — `keyof` over an object literal's inferred type, which is where every `tag` in
    this package comes from — renders with **double** quotes in the same program.
12. **The pinned bridge re-reads `configFilePath` and puts the config's own `noEmit` back.** A
    program built from `parseJsonConfigFileContent(...)` with `noEmit: false` layered on top emits
    **nothing** once any other program has been built in the same process — the re-read wins.
    Deleting `configFilePath` from the options fixes it. Same mechanism as the `include`
    re-expansion the harness already records, seen from the other side. **⟳ Historical since the
    bridge's removal (§9.8): stock does no such re-read. The deletion stays as hygiene, and the
    explicit root-file list the `include` half mandated is load-bearing on stock outright.**

---

## 10. The `TS2321` record — two observations, both recorded

This section exists because a single-sentence inheritance would be wrong in one direction or the other.

> **⟳ Historical since the bridge-removal effort (§9.8's second ⟳ note).** `TS2321` here is a
> tsgo-side phenomenon — §10.1 itself records real TypeScript reporting none of it — and the gate
> no longer runs tsgo anywhere. The record stays for the day a native-TS evaluation is reopened,
> and the spelling fixes §9.9 traps 8 and 9 recorded remain in the shipped source on their own
> merits.

### 10.1 What research 02 measured

This repo's pinned `typescript-native-bridge@6.0.3-bridge.8.tsgo.7.0.2` emits **`TS2321 Excessive
stack depth`** wherever `AvailableRouterMethod<R>` meets an unresolved generic. Real
`typescript@6.0.3` reports none of it on identical files, and Nuxt hides its own instance behind
`skipLibCheck`. 02 predicted this would reappear for "anyone type-checking wrapper *source* with
tsgo". Measured on a standalone probe against the reference install. Whether it is a known upstream
bug was not established.

### 10.2 What the prototype measured — a PARTIAL CONTRADICTION

**No `TS2321` anywhere** — not from `ErrorsOf`'s two extra conditionals, and **not from `Method$<ReqT>`
in the wrapper's own source, which is precisely where 02 predicted it.** The wrapper source was
confirmed to be inside the checked program by planting a deliberate `TS2322` and watching it fire, so
this is an *absence of diagnostics*, not an absence of checking. `pnpm check` was `CHECK_EXIT=0` from
a cold turbo cache with the whole surface in place.

**Both observations stand.** 02 measured the diagnostic on a standalone probe; the same construct
inside this package's own `vue-tsc` program does not reproduce it. Whether that is a bridge-version
difference or a program-shape difference **was not chased** — the prototype's question was whether the
gate goes red, and it does not. The spec records both rather than inheriting 02's warning unqualified.

Note that §9.8's compiler decision means **neither observation is now under test.**

> **⟳ Measured in implementation — research 02 was right, the prototype was right about its own
> program, and the truth is that `TS2321` is a property of the *program*, not of this mechanism.**
> Four measurements, in order:
>
> - **The headroom in this repo's own package program is one `InternalApi` key.** A hermetic fixture
>   augmenting the interface with a single extra route was enough to redden an unrelated plain
>   `$fetch` call elsewhere in the suite. Fixtures that augment are now excluded and compiled alone
>   (§9.9 trap 7).
> - **Instantiation count is not the trigger.** The lookup spent far more than one key — two new
>   playground routes, six `DeclaredErrorsOf` instantiations plus three vanilla `$fetch` calls in the
>   server program, five more in the app program, and a fixture augmenting `InternalApi` with four
>   keys and instantiating the lookup fourteen times — and stayed green from a cold turbo cache.
>   `methodKeys: 'expanded'` was **not** needed and was left alone.
> - **What *is* the trigger is `Uppercase<AvailableRouterMethod<R>>` meeting an unresolved `R` in
>   checked source**, which is research 02's finding exactly, and it reproduced three more times
>   during implementation: at a playground handler whose return type was inferred from a `$fetch`
>   call (six diagnostics, in a **plain `defineEventHandler`** with no part of this module in it — the
>   mechanism is §6.6's cycle, and the fix is one return annotation); at `.safe`'s signature when the
>   method was instantiated via a *constrained* defaulted parameter on the call signature (three, one
>   per key, reported inside `src/runtime/types.ts`); and at a variable annotation on a typed fetch
>   call (twelve). All three fixes are spellings, and all three are recorded as §9.9 traps 8 and 9.
> - **§10.3's trigger condition is unchanged and still unmeasured at scale.** Nothing above says a
>   200-route app will not tip the compiler over; what it says is that when it does, the fix is a
>   spelling before it is `expanded`.

### 10.3 06 §5's Option 2 stays in the spec, with its trigger condition intact

The `ErrorsOf` chain adds a second `MatchedRoutes<R>` traversal plus two conditionals in exactly the
deferred-generic position 02 measured. **Option 1 — accept — is chosen**, instantiating once via a
defaulted type parameter (`<R, M, E = ErrorsOf<R, M>>`) so expansion happens in one place. Reasons:
two conditionals are a rounding error next to `MatchedRoutes` itself, which recurses per-character
through `CalcMatchScore`; TypeScript memoizes identical conditional instantiations, so
`MatchedRoutes<'/api/users/123'>` computed by Nitro and again by us should hit cache; and the root
cause is Nitro's own `AvailableRouterMethod`, already present in vanilla `useFetch`'s signature.

**Option 2, the documented fallback:** since `RouterMethod` is a closed nine-member union, the emitter
expands every `default`/`all` route into nine explicit method keys minus any method with its own
handler file, drops the `default` key, and collapses consumption to a bare index
`TypedApiErrors[MatchedRoutes<R>][Lowercase<M>]` with **zero conditionals**. Costs a nine-fold
expansion of catch-all routes in the emitted file and a deliberate divergence from Nitro's key shape.

> **Trigger condition (unchanged): the added conditional depth is what tips tsgo over.**

**Option 2 is known-good, not merely written down.** The prototype exercised it behind a
`methodKeys: 'expanded'` module option and **every assertion, including all three method-resolution
rows, still passed**. §4.6's second emitter test is what stops it rotting into a fallback that no
longer compiles the day it is needed.

**Scale is unproven.** One app, six routes. Nothing measured says a 200-route app will not tip tsgo
over.

---

## 11. What was ruled out, and why

An implementer who does not know these were already rejected will re-propose them.

### 11.1 Mechanism

| Rejected | Why |
| --- | --- |
| **Zero codegen** — a static mapped type over `InternalApi` | Dead twice over. The brand is deliberately *not* in the return type, so it is not in `InternalApi` and no mapped type can see it; and `typeof import(S)` with generic `S` is `TS1141: String literal expected`, a **parse** error with no escape. |
| **Putting the brand in the return type** to enable the above | Pays exactly the `useFetch` pollution the whole design exists to prevent. |
| **Mutating `types.routes` inside `types:extend`** | Changes `InternalApi` for every call site — same violation. |
| **Naming the handler module at each call site** | Violates the destination: the union must come *from the route path alone*. |
| **Declaring `TypedApiErrors` inside `nitropack/types`** | Squatting; a future Nitro release owning that name breaks consumers silently, and it would give our public surface a second owner. |
| **Direct `fs.writeFile` from `types:extend`** | Loses `<script setup>` visibility, Nitro-program membership, and cold-start safety — all three must then be hand-rolled. The claimed "impossible to desynchronise" advantage does not survive scrutiny: both routes are stale at t=0 and correct at convergence. |
| **A user-hand-authored `TypedApiErrors` augmentation** | Relocates staleness to the developer's memory. |
| **An emitted runtime value map (`route → method → Set<tag>`)** | Cannot be path-referential. Adding a variant to an existing handler would leave it stale with no watcher that would ever fix it — promoting "confidently wrong is worse than absent" from the type level, where it cannot happen, to the runtime level, where it silently can. |
| **Copying Nitro's emptiness-based method fallback** | `never` is a sentinel for Nitro and a *legitimate value* for us. Nitro's rule hands a `POST` caller the `default` handler's errors. |
| **Modelling h3's cross-route fallthrough** | `AvailableRouterMethod` already makes such a call `TS2769` through the typed surface; the block is inherited from vanilla. |

### 11.2 The Result question (04, 07)

| Rejected | Why |
| --- | --- |
| **`neverthrow`** | Outright: zero tagged-error support — `_tag` appears nowhere in `src/`, and tagged errors were the load-bearing requirement. |
| **`typescript-result`** | The `ok` discriminant is a **prototype getter**, so it vanishes on serialization. |
| **`better-result`** (closest contender) | Native tagged errors and a real wire story — but its tag helpers are constrained to `Error & { _tag: string }` and **reject the deserialized plain object** (TS2769/TS2339). Its best feature evaporates exactly where this module needs it. Its `toJSON()` also includes `stack` by default: a server stack-trace leak. Three majors in seven months; v3 deleted the entire v2 serialization API. |
| **The t3 `tryCatch` gist** | A try/catch adapter, not an error model — no tags, no status, unsound `error as E`. |
| **Any Result dependency at all** | All three model a Result as a **class instance**, so none can be the wire type; and `Serialize` silently mangles classes (methods stripped, private fields dropped, getters kept as plain data — a lie). Confined to server-internal use the dependency stops paying for itself, and mkdist would leak its types into the public surface. |
| **Control-flow-inferred error unions** (the libraries' headline feature) | Wrong feature here. This union is a *published contract* — silent widening when someone adds a `return fail(...)` breaks clients with no reviewable diff. Explicit declaration is what this design wants. |
| **Combinator vocabulary** (`map`/`andThen`/`gen`/exhaustive `match`) | **Dissolved, not deferred.** 07 chose a `fail` that throws and returns `never`, so no Result value ever flows through a handler body — a multi-step body is linear imperative code with early exits. There is nothing to combine. |

### 11.3 The server declaration surface (07, 12, 13)

| Rejected | Why |
| --- | --- |
| **`defineTypedEventHandler<MyErrors>(handler)`** | Compiles clean, brands correctly, and **silently collapses the success type to `any`**. Now unrepresentable via `TS2558`, not merely discouraged. |
| **h3's single options-object (`EventHandlerObject`) form** | The handler stops being the last argument; the brand was never probed through it, so it would have meant building our own object handler anyway. |
| **A bare catalogue array in first position** | Nowhere to put a later option without an overload pair discriminating array-vs-object in first position — exactly where inference gets fragile. |
| **A curried `withErrors(authErrors)(handler)` factory** | Genuinely DRY, but moves the declaration out of the route file. This is the most-read surface in the design; a route must state the contract it publishes. |
| **Returning a Result value from the handler** | The only shape where control flow *proves* the union — but it puts ceremony on the happy path and adds a second place the success type can go wrong, since the definer must unwrap before `InternalApi` sees it. |
| **A default status of 400** | Makes a variant's status invisible where it is declared and quietly turns 404/409/403 into 400s. |
| **Bare-number status shorthand (`'unauthorized': 401`)** | Terse and still explicit, but puts two shapes of value in one object literal, which reads unevenly down a catalogue. |
| **A `Prettify`/flattening alias inside `VariantsOf`/`PayloadOf`** | Measured to change the rendered hover *not at all* — `Simplify<Serialize<…>>` on the emitted map already does it. One fewer type in a surface where every type is an mkdist leak. |
| **A hand-written union type plus a status map** | Perfect hover by construction, but writes the tag list twice. |
| **Payload constructor functions** | Go positional at the raise site (`fail('forbidden', 'owner')` — what is that?) and lose payload literal types whenever a field is computed, because `const` type parameters do not propagate into an inferred function return type. |
| **Guard-last intersection (`{ errors: C } & ConflictGuard<C>`)** | Detects the conflict but the developer never learns which tag collided — TypeScript truncates the tail. |
| **Registering `shared/errors/` as an auto-import directory** | Duplicates what Nuxt already does for `shared/utils/**` and `shared/types/**`, and makes the most-read surface less traceable — `errors: [authErrors]` with no import to click through. |
| **Bare variant records directly in `errors:`** | Saves one line, but makes the list heterogeneous and creates a second tier of variant the escape hatch cannot reach, since there is no catalogue value to call `.raise()` on. |
| **Mandating that catalogues live in `shared/`** | Unenforceable at every level — nothing at the type level, at build time, or at runtime can see which file a catalogue came from. A rule nothing can check is a convention with a stern voice. |
| **Splitting catalogues until granularity matches every route** (instead of `.pick()`) | Combinatorial, and each split is a fresh chance for the same tag to drift — the exact failure catalogues exist to prevent. |

### 11.4 Validation (13, 17)

| Rejected | Why |
| --- | --- |
| **Schema-typed issue paths (`PathsOf<Input>` literal unions)** | Forces a catalogue factory; lands recursion in the deferred-generic position and ships **unevaluated** into the emitted `.d.ts`; and **degrades to `string` for exactly the schemas that need it most** (`z.record`, `z.union`, recursive, array-of-object). A floor, not a ceiling — a factory is purely additive later. |
| **Re-exporting Standard Schema's own `Issue`** | Never available. `Issue.path` is `ReadonlyArray<PropertyKey \| PathSegment>` and `PropertyKey` includes `symbol`, so through `Serialize` it is `(string \| number \| { readonly key: string \| number } \| null)[]`. Normalisation was mandatory. |
| **Per-location tags (`invalid-body`, `invalid-query`)** | Forces every route to keep a `.pick()` list in agreement with its schema keys, with nothing checking it. Drift is a silently-published lie in either direction. |
| **Fail-fast per source** | Makes a caller fix `body`, resubmit, and only then learn `query` was also wrong. |
| **A dotted-string `path`** | Lossy — a key containing `.` stops being recoverable. `.join('.')` at the call site is free. |
| **A plain-`(v: unknown) => T` validator escape hatch** | Reopens h3's `safeParse` hole verbatim, since a `safeParse` reference is exactly that shape. |
| **`headers` as a fourth location** | h3 offers no analogue, header contracts are a middleware/gateway concern, every header value is a string. Recorded explicitly because `location` is a closed union — adding a member later widens a published payload. |
| **Lazy accessors (`await input.body()`)** | Would let the author order auth before validation, but costs the guarantee: a handler that never calls the accessor publishes a failure it can never emit. |
| **Namespaced `{ fail, input }` context** | Tidier growth story, but this is the most-read surface and `input.body` buys nothing over `body`. |
| **A presence guard plus an opt-out flag** | Detects the "forgot the catalogue" mistake but reintroduces the same silence through the flag, and adds a second guard to the most-read surface. |
| **Delegating to h3 v2's native validation** (either level) | §7.4 — no `params`, query coerced back to string, lazy body Proxy, fail-fast per source, no `location`. Unusable, permanently. |
| **Runtime h3-version feature detection** | Two paths that must produce byte-identical `path` arrays are untestable in one install, and the divergence would surface only inside a consumer's Nuxt upgrade. |
| **An adapter for pre-Standard-Schema validators** (yup, joi, superstruct, zod < 3.24) | Consumers wrap it themselves or validate inline. The docs say so plainly. |

### 11.5 The client surface (02, 10, 11)

| Rejected | Why |
| --- | --- |
| **Widening the union to `Declared \| { tag: string & {}, status: number }`** | **Measured dead.** Costs not a `default` branch but *all* narrowing — `TS2339` on every payload, in every branch. |
| **A `{ recognised: true \| false }` two-level result** | Narrows correctly, but `recognised` is **not computable**: no client-side runtime list of a route's declared tags exists, and requiring a catalogue import would break a legal `server/`-only layout with no compile-time signal. |
| **Keeping `ErrorT` as a type-parameter slot** | `TS2744` — it sits at #2 and can never default from `ReqT` at #3. Deleting it and computing the error in the return type keeps `ResT` at #1; the slot loses nothing real, since passing it explicitly already collapsed `data.value` to `unknown`. |
| **Hoisting `ReqT` to the front** (the prototype's shape) | Works, but costs `ResT` position #1 and with it `useTypedFetch<Foo>(url)` — a compile error the degradation lock forbids. |
| **Dropping overloads 2 and 4** | They never won resolution in any probe, but *what selects them* was explicitly Not Established. Dropping them on an unfinished understanding was declined. |
| **Replacing the `error` ref at runtime with a bare union** | Type-checks while lying — `asyncData.js:375` unconditionally puts a `NuxtError` there. The sketch's ergonomics are recovered by a named reader instead. |
| **`createUseFetch` (Nuxt 4.2+)** | Returns `UseFetch<FDataT, FPickKeys, FDefaultT>` with **no error slot**, so it cannot bind per-route error types. |
| **A `useAsyncData` counterpart** | Takes a function, not a route literal — a wrapper could only re-ask for the route *unverifiably*. A departure from the author's intended shape item 4, recorded as such; both existing routes to typed errors are documented instead. |
| **Making `$typedFetch` always return a Result** | Permanent `.data` shape tax on every undeclared route (breaks the degradation lock); a return-shape change is not a typing change; and `useAsyncData(() => $typedFetch(…))` would break, reopening the decision above. |
| **A return type conditional on declaration** (`[D] extends [never] ? Promise<T> : Promise<Result>`) | Satisfies the degradation lock perfectly — but adding the first `fail()` then breaks every existing call site of that route, the return *shape* varies per route so a union-typed path variable degrades to `T \| Result`, and composition would work only for undeclared routes. Inconsistency that must be taught rather than derived. |
| **A third arm containing framework failures** | Makes `error` nullable *inside* the `ok: false` arm — a narrowing tax on the arm that exists to remove one — and breaks undeclared-route degradation. |
| **Flattening the framework failure in as an extra union member** | The widened union wearing a hat. Already measured as `TS2339` on every payload in every branch. |
| **Not mirroring `raw` / `create`** | `$typedFetch.` showing a shorter completion list than `$fetch.` is a visible way to fail the degradation lock, and it forces a call site needing both typed errors and the raw response to pick one. |
| **`create` returning a vanilla `$Fetch`** | A silent typing cliff — the call compiles and `.safe` vanishes one level later with no signal. |
| **`.safe` on `raw` or on `create`** | `raw`'s value is the response object, orthogonal to the declared channel; a created instance's `.safe` is the same `.safe`. |
| **Naive header spreading (`{ accept, ...opts?.headers }`)** | Silently drops caller headers for `Headers` instances and corrupts tuple arrays — a shipped-defect-class bug. |
| **One shared header helper across both fetch surfaces** | Would be a defect: the global wrapper must pass a `Headers`, the event-bound wrapper must flatten with `Object.fromEntries`. The correct fix for one is wrong for the other. |

### 11.6 The wire (08)

| Rejected | Why |
| --- | --- |
| **Response headers as the marker** | They do not survive `H3Error.toJSON()`, so a header marker would be present on one of the three paths and absent on the other two. Nitro also builds its own header set, and `createError` has no header channel — not even reachable from the raise site. Eliminated on evidence. |
| **Catalogue lookup as the evidence** | The catalogue the client imports is compiled from the client's own tree; asking it "is this tag known?" is the client asking itself what it already knows. Only the *server* can say whether it declared something. Also breaks a legal `server/`-only layout with no compile-time signal. Fine for narrowing helpers; bad for establishing declaration. |
| **A signature or HMAC over the payload** | The marker is exactly as forgeable as the success payload, and the client already trusts the server for that. A forged marker from an origin the app chose to call is not a new attack surface; it is the same one. |
| **Shipping the route's full declared tag list in the envelope** | `fail` genuinely can see it and it would help devtools — but it costs bytes on every failure, no client behaviour depends on it beyond the tag, and it **publishes a route's complete failure contract to any unauthenticated caller who can provoke one error**. |
| **A catalogue-supplied `message`** | Reads better, but adds a field to the compile-verified `{status, payload}` shape, widens a public-API type mkdist ships to every consumer, and invites call sites to render `message` instead of switching on the tag — the exact behaviour this design exists to replace. |
| **Documenting the `bigint` hazard instead of guarding it** | `bigint` does not just vanish from the client's type — it makes `JSON.stringify` **throw** inside Nitro's serializer, converting a declared 403 into a genuine unhandled 500. |

### 11.7 Server-to-server (14)

| Rejected | Why |
| --- | --- |
| **A `fail.forward(r.error)` helper** | Can only type-check when the caller has already declared the tag, so it is sugar over a two-line branch — and it would quietly encourage forwarding, the one shape the ticket was asked to be careful about. |
| **An exported `typedFetchWithEvent(event)` factory** | Free of both of `event.$typedFetch`'s costs and genuinely tempting — but lost on discoverability. `event.` completion is where a handler author looks, and a second vocabulary for the same call is what the naming work spent itself avoiding. |
| **A location-based forward/remap rule** (forward freely from `shared/`, remap for `server/`) | The union travels via the brand, so the module can never see which file a catalogue came from. Unenforceable convention. |
| **Normalising an escaped callee throw into an `H3Error`** | Stops the escalation and keeps the message, but breaks the typings-only lock — which would then hold on the client surface and not the server one, for a hazard that predates the module. |
| **Converting an escaped callee throw to an honest 500** | Strongest isolation, same objection. |
| **Cycle-detection machinery** | The cycle is Nitro's, with byte-identical diagnostics when our mechanism is removed entirely. Warning about a pre-existing Nitro property in the module's own voice would misattribute it. |

### 11.8 Packaging, compatibility and testing (15, 17, 18)

| Rejected | Why |
| --- | --- |
| **Splitting into server-only and client-only packages** | 06 plus 07/12 require `TypedApiErrors`, `ErrorCatalogue`, `VariantsOf` and `Payload` reachable from one specifier resolving from client, server **and** `shared/`. Any split needs the shared types in a third package — the two-package option with extra steps and a second version-skew axis. |
| **A five-way side-shaped export split (`/server`, `/app`)** | `/types` carries the shared types anyway, so the split only partitions runtime values — buying isolation mkdist's per-file emit already gives. |
| **A `/runtime/*` wildcard export** | Makes every file under `dist/runtime/` public API, colliding head-on with §8.1. |
| **The name `nuxt-typed-results`** | Rejected on substance, not just reachability: 04+07 dissolved the Result entirely, so it advertises combinators the design concluded are unnecessary. (Also unreachable — the `@dphonys/` scope is hard-coded in the scaffolder.) |
| **`nuxt-typed-errors` / `nuxt-typed-api-errors` / `nuxt-declared-errors`** | All considered. `nuxt-handler-errors` was chosen: it names *where the declaration happens*, and carries no claim the design does not honour. |
| **Exact pins on `h3`/`nitropack`/`pathe`** | §7.2 — an exact pin *causes* the duplicate-instance failure that pinning normally prevents. |
| **A `peerDependencies` block** | §7.2 — under pnpm's `auto-install-peers` an unmet transitive peer is **installed**, not errored, producing the second physical copy the declaration was meant to prevent. |
| **`compatibility: { nuxt: '>=4.0.0' }`** (the template's) | Dishonest in both directions — see §7.1. |
| **Supporting h3 v2 / Nitro 3** | Out of scope — §12.1. |
| **`@ts-expect-error` as the negative-test mechanism** | Asserts only *"some error here"* — cannot distinguish `TS2345` from `TS2558`, is satisfied by an unrelated error on the same line, sees no message text, and breaks the compile-alone mandate. It stays good *inside* positive fixtures for narrow claims where the surrounding file must otherwise compile clean and the directive being **consumed** is the assertion. |
| **`vitest --typecheck`** | Compiles all test files as one program — precisely what the compile-alone mandate exists to prevent — and drives an external `tsc`/`vue-tsc` binary by name rather than the checker we can prove we are holding. |
| **`expectTypeOf`** | A hard fact, not taste: it only fails anything under `vitest --typecheck`. Outside that mode it is a runtime no-op that always passes. |
| **Inline snapshots for the guard-first message mandate** | Churn on every unrelated rendering change; a churning snapshot gets `-u`'d reflexively; and the failure reads "a string moved" rather than "guard-first broke". |
| **A structural `Equal<>` assertion on the intersection order** | A tautology that restates the source line and proves nothing about legibility, which is the entire point. |
| **A third-party type-assertion helper dependency** | A second vocabulary for four lines already proved. |
| **A gated dev-server timing test** | Flaky by construction — a persistent dev server inside `pnpm check`, and the first thing disabled on a loaded CI box. The invariant is structural and is tested hermetically instead. |
| **An additional fixture Nuxt app** | The playground already exists and is the more faithful fixture. |

---

## 12. Inherited fog — open questions the map deliberately left

**These are open. They were not considered and settled; they were consciously not sharpened.** An
implementer who does not know that will assume otherwise.

### 12.1 Out of scope — will not be revisited within this effort

Verbatim from the map. These never graduate; they return only as a fresh effort.

- **Becoming a general `Result<T, E>` framework.** The module models expected *endpoint* outcomes
  only. Ruled out by the effort's own framing.
- **Replacing or intercepting Nuxt's handling of unexpected errors.** Programming errors, database
  crashes, network failures, and framework errors continue to behave exactly as they do today. **The
  module adds a lane; it does not redirect traffic out of the existing one.**
- **Supporting the h3 v2 / Nitro 3 line.** `compatibility.nuxt` is `>=4.5.0 <5.0.0`, and the
  destination is a spec for a **Nuxt 4** module. §7.3's table ships as a forward-compatibility note —
  flagging the divergences is in scope; porting is not. The **Nitro 3 half is deliberately
  unmeasured**: its error serializer, `isJsonRequest`, `localFetch`, `fetchWithEvent`'s header merge,
  and above all whether it still emits `nitro-routes.d.ts` with the same `InternalApi` and still fires
  `types:extend` — which is §4's entire mechanism. No Nitro 3 exists on any reachable tree, and
  measuring an RC for a version the module has just declined to claim would have a shelf life shorter
  than this spec.
- **Moving `packages/*` off the tsgo bridge onto stock TypeScript.** Correct on the merits (§9.8) but
  it is **repo tooling, not this module's design**: `pnpm-workspace.yaml` carries a workspace-wide
  `overrides: typescript: npm:typescript-native-bridge@…` forcing *every* `typescript` in the repo —
  including `packages/*` and the `vue-tsc` they typecheck with — onto the bridge, and narrowing it
  touches `scaffolder`, `release/*` and the root gate. Returns as repo work.
  **⟳ Returned, and done as exactly that: the bridge-removal effort took the whole repo — override,
  root gate, `scaffolder`, `release/*` and `packages/*` alike — onto stock TypeScript in one move
  (§9.8's second ⟳ note), so no per-package narrowing was ever needed.**

### 12.2 Genuinely open — the implementation effort inherits these

1. **Observability, and `captureError`.** Error-page escalation is already correct for free —
   `nuxt-root.vue:77` escalates only on `fatal || unhandled`, so a declared failure never reaches the
   global error page. But **Nitro's `captureError` fires the `error` hook unconditionally**, so
   Sentry-style integrations will see every declared failure as an error. Whether the module should
   suppress that, and how, is unresolved.
   **There is a second, louder case with a different character** (§6.5): a callee's declared failure
   that a caller lets escape is `unhandled`, so it is logged as `[request error] [unhandled]`, fires
   `captureError`, *and* escalates to the global error page. That is correct behaviour for a genuine
   caller bug, so it may want no suppression at all while the first case does. **The two halves may
   not have one answer.**
2. **Whether `nitro.errorHandler` being overridden should be detected and warned about.** There is a
   third serializer at `nitropack/dist/runtime/error.mjs:18-24` that **drops `data` entirely** — not
   on the default path, but a project pointing `errorHandler` at it would silently lose every declared
   payload **with no compile-time signal**.
3. **Whether the unenforced `.raise()` escape hatch (§6.3) wants a backstop** — a lint rule, a
   dev-time check, or simply the documented rule. Not sharp enough to ticket, and probably wants real
   handler code to judge against.
4. **Adoption path for handlers that already exist and throw `createError` by hand** — whether the
   module offers incremental migration or is all-or-nothing per route. Untouched.
5. **Whether the module needs any devtools panel or generated documentation surface.** Untouched.
6. **Whether the wire marker should be honoured on responses the app did not originate.** 08 made
   marker presence sufficient evidence, reasoning that a forged marker is no worse than a forged
   success payload — which holds for a first-party Nitro origin and is less obviously right for
   `$typedFetch` pointed at an arbitrary external URL, which the degradation lock explicitly permits.
   **Now narrowed to exactly one surface and ungated:** the *typed* channel refuses a foreign marker
   for free on both wrappers (an external URL resolves the union to `never`, so the error degrades to
   `NuxtError<unknown>` and `.safe`'s `ok: false` arm **does not exist**). What remains is purely the
   **runtime reader** — `declaredError()`'s second overload reads the floor off any error whatsoever,
   so a forged marker from an arbitrary origin is readable at floor level. Standalone question: should
   the reader require a same-origin or first-party signal?
7. **Whether an opt-in, catalogue-driven skew-safe match helper is worth shipping.** §6.2 closed the
   union and §6.4 accepted the standard tail. A caller *could* recover exactness by passing a catalogue
   as the runtime tag list — 08's floor guarantee exists precisely so that is decidable — but a
   `server/`-only catalogue is legal, so it can never be more than opt-in. Whether the ergonomics earn
   a second match vocabulary probably wants real app code to judge against.

### 12.3 Fog that was DISSOLVED — not open, and stated so it is not re-opened

Three questions that look like they should be open, and are not:

- **Result combinator vocabulary** — dissolved by 07, not deferred. `fail` throws and returns `never`,
  so no Result value ever flows through a handler body. There is nothing to combine.
- **Client runtime cost and bundle impact** — dissolved by 10 + 11, not deferred. The composable half
  is one `useFetch` delegation plus a header merge; the readers are two small functions. The imperative
  half is one `$fetch` delegation, a `Headers` merge, and a try/catch calling that same reader. **No
  new dependency** (04 ruled one out) and **no per-call allocation beyond the `Headers` object vanilla
  already builds.** The whole client surface is accounted for; there is nothing left to measure.
  *(The server side does add per-request runtime presence — §3.6 — which is a different bullet and is
  a taken decision, not fog.)*
- **`<NuxtErrorBoundary>` and `showError` interplay** — dissolved by 10, not deferred. The wrapper is
  typings-only: it never throws, never calls `showError`, and leaves `fatal`/`unhandled` alone, so the
  interplay is exactly vanilla's. Combined with `nuxt-root.vue:77` escalating only on
  `fatal || unhandled`, there is nothing to specify.

---

## 13. Evidence index

Everything below is preserved and linkable rather than inlined.

| Evidence | What it proves | Result |
| --- | --- | --- |
| [`research/07-verified-surface/`](../../.scratch/nuxt-typed-endpoint-results/research/07-verified-surface/README.md) | the declaration surface (§3.1, §3.2) compiled end to end against the real 4.5.1 install | `EXIT=0` on the pinned tsgo bridge; 8 positive assertions + 8 compile-failure tests + compiler-API hover renders |
| [`research/09-spine-prototype/`](../../.scratch/nuxt-typed-endpoint-results/research/09-spine-prototype/README.md) | the whole spine (§4, §5) in a real Nuxt app — module source, playground, emitted map, rendered hovers, two dev-server measurement scripts | all 11 obligations measured; `pnpm check` `CHECK_EXIT=0` from a **cold** turbo cache; 15 compile-time assertions + 6 e2e tests |
| [`research/10-shape-probes/`](../../.scratch/nuxt-typed-endpoint-results/research/10-shape-probes/README.md) | the widened union is dead; the `ErrorT` slot cannot default; reader inference through two generic levels | `EXIT=0` on `typescript@6.0.3` |
| [`research/11-imperative-probes/`](../../.scratch/nuxt-typed-endpoint-results/research/11-imperative-probes/README.md) | `declaredError` collapses in a `catch`; `{ok:false, error:never}` is inhabited; the header merge fix across all three `HeadersInit` forms; `create` defaults | `EXIT=0`, all directives consumed |
| [`research/13-validation-probes/`](../../.scratch/nuxt-typed-endpoint-results/research/13-validation-probes/README.md) | the validation surface (§3.3), built **on top of** the 07 probe so the two cannot drift | `EXIT=0`; 8 positive assertions + 4 compile-failure tests + a four-spelling hover comparison |
| [`research/14-server-probes/`](../../.scratch/nuxt-typed-endpoint-results/research/14-server-probes/README.md) | no internal short-circuit; the event header trap; the cycle is Nitro's; A→B→C is linear | `EXIT=0`; three cycle variants compiled as separate programs |
| Research write-ups | `research/01a`, `01b`, `02`, `03`, `04`, `05`, `07-candidate-surfaces` | the primary-source reads every decision above rests on |

**The 09 prototype exists in two places, and one of them is fragile.** It is preserved as a snapshot
under `research/09-spine-prototype/`, **and** as `git stash@{0}` (commit `1b49b398635b`, message
*"ticket 09 spine prototype …"*) against the tracked tree at `bdc762c`. The tracked package was
deliberately returned to `bdc762c` so the map's "no module code beyond one throwaway prototype"
destination held and tickets 10/11/13/14 stayed decidable on merit. **A local stash is not a durable
artifact** — an implementation effort that wants the prototype should recover it early.

> **⟳ Recovered in implementation.** Ticket 01 did exactly that, first. The prototype is now a real
> ref: branch `ticket-09-spine-prototype`, tag `ticket-09-spine-prototype-snapshot`, commit
> `1b49b398635b`. The stash is left in place as well. **Do not delete either ref or `stash@{0}`** —
> they are the only copies outside the one gitignored working tree.

> ⚠️ **This document is the only tracked artifact. Everything it cites is not.** The map, all 20
> tickets and all six probe directories remain under `.scratch/nuxt-typed-endpoint-results/`, which
> is gitignored — deliberately, on the effort originator's call. The consequence is worth stating
> once, plainly: **the evidence behind every claim marked *measured* in this spec exists in exactly
> one working tree.** If that tree is lost, the decisions survive here in full and the measurements
> that justified them do not. Re-measuring is possible — every probe records how it was run — but it
> is not free.

---

## 14. Immediate follow-on

- ~~**Ticket 20 — teach knip about `packages/*`**~~ — **⟳ done.** `pnpm knip` is green; the entry
  points are §3's export map, as predicted.
- ~~**The `compatibility` change (§7.1)**~~ — **⟳ done**, in both files.
- ~~**The export map (§3, §8.2)**~~ — **⟳ done.** `exports` and `typesVersions` both carry the
  `/types` and `/shared` entries.
- **Publication admission** (removing `private: true`) happens per the repo's Publication boundary
  once starter behaviour and docs are replaced. That is the implementation effort's call, not this
  map's.

  > **⟳ Assessed in implementation, and recommended rather than taken.** The two gates this bullet
  > names are now closed: starter behaviour is gone (ticket 01 removed the code, ticket 15 the
  > prose) and the package has a README that documents the shipped surface. `pnpm check` and
  > `pnpm knip` are green from a cold turbo cache and `publint` reports no problems against a real
  > `dist/`. **The recommendation is to admit it**, at `0.1.0` rather than `0.0.1` — the surface is
  > complete against this document and the version should say "usable, not yet stable". The call
  > belongs to the repo owner, and until `private: true` is removed the package is not a Publishable
  > package, so it owes no Release intent: its first intent is the one that accompanies its
  > admission. Two things a maintainer should weigh first, both of them documented rather than
  > blocking: §9.8's consumer-compiler gap (nothing in the gate proves the surface on stock
  > TypeScript, which is what every consumer will use), and the four coverage gaps §9.1's amendment
  > and the README's limitations section name.

  > **⟳ Both weights have since resolved (the coverage-gaps effort).** The consumer-compiler gap is
  > closed — every harness suite now runs under stock TypeScript beside the bridge (§9.8's ⟳ note) —
  > and the coverage-gap list is down to one deliberate remainder: whether upstream still *fires*
  > `types:extend`, observable only from a live dev server and ungated by design (§9.6). The
  > recommendation stands with nothing left to weigh beyond that remainder. **⟳⟳ Strengthened by
  > the bridge-removal effort: stock TypeScript is now the gate's only compiler (§9.8's second ⟳
  > note), so the consumer-compiler property holds by construction rather than by a second row.**
