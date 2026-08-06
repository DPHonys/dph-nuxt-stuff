/**
 * `$typedFetch` and `$typedFetch.safe` at layer 1: the whole
 * namespace over a hand-written stand-in for a generated map, with nothing
 * running.
 *
 * The playground makes the same claims against a **real** Nuxt build — that is
 * where a map whose specifiers resolve to nothing would show — and this file is
 * the fast half: it says what the *rule* is, in one screen, and it keeps saying
 * it on the day a Nuxt or Nitro bump takes the real build down.
 *
 * Must compile with **zero** diagnostics.
 *
 * **Excluded from the package's own `tsconfig.json`, and it has to stay
 * excluded** — for the reason `./lookup.ts` and `./unreachable-map-key.ts`
 * record: the `declare module 'nitropack/types'` block below is an
 * augmentation, an augmentation is global to whatever program contains it, and
 * one extra `InternalApi` key was measured to be enough to turn an unrelated
 * `$fetch` in this package into `TS2321 Excessive stack depth`. The harness
 * compiles it alone.
 */

import type { NitroFetchRequest } from 'nitropack/types'
import type {
  $TypedFetch,
  TypedApiErrors,
  TypedResult,
} from '../../../src/runtime/types'
import type { Equal, Expect, IsAny, IsNever } from '../vocabulary'

/**
 * Imported for the **render's** sake rather than for an assertion: a name the
 * fixture does not import renders as `import("…").Name`, and the hover
 * budgets were taken in an editor, where a call site's own file has the name in
 * scope. The alias below is what keeps the import used.
 */
type _RequestIsNitros = NitroFetchRequest

/** What the branded `default` handler of `/api/y` declares. */
interface YDefaultFailure {
  tag: 'unauthorized'
  status: 401
}

/** What `/api/users/:id` declares, on `get` only. */
type UserFailure =
  | { tag: 'user-not-found'; status: 404; userId: string }
  | { tag: 'user-suspended'; status: 403; until: string }

/** Nitro's own interface, standing in for a generated `nitro-routes.d.ts`. */
declare module 'nitropack/types' {
  interface InternalApi {
    '/api/y': { default: { via: 'default' }; post: { via: 'post' } }
    '/api/users/:id': { get: { id: string } }
    '/api/legacy': { get: { legacy: true } }
  }
}

/** This module's map, keyed exactly as Nitro keys the interface above. */
declare module '../../../src/runtime/types' {
  interface TypedApiErrors {
    '/api/y': { default: YDefaultFailure; post: never }
    '/api/users/:id': { get: UserFailure }
    '/api/legacy': { get: never }
  }
}

/** Keeps the import above used; the augmentation needs the module named. */
type _MapIsAugmented = TypedApiErrors

// ---------------------------------------------------------------------------
// The default entry point is a pure typings mirror of vanilla
// ---------------------------------------------------------------------------

/**
 * **The throwing form adds nothing at all**, and that is stated structurally
 * rather than asserted: `Base$TypedFetch` *is* Nitro's `Base$Fetch`, so the
 * pair below cannot drift even across a Nitro release that changes the
 * signature.
 *
 * The two consts are also the byte-identity pair
 * `test/types/typed-fetch.test.ts` renders against each other — the strongest
 * form the degradation lock has, and the one that also catches two types being
 * structurally equal while the wrapper's answer has grown an alias a caller
 * would have to read through.
 */
const _typedThrown = $typedFetch('/api/users/123')
const _vanillaThrown = $fetch('/api/users/123')

async function _defaultEntryPointIsVanillas(): Promise<unknown[]> {
  const typed = await $typedFetch('/api/users/123')
  const vanilla = await $fetch('/api/users/123')

  type _successIsVanillas = Expect<Equal<typeof typed, typeof vanilla>>
  type _successIsTheRoutes = Expect<Equal<typeof typed, { id: string }>>

  // A method-carrying call resolves on both sides through Nitro's own
  // `ExtractedRouteMethod`, which is the expression the typed namespace
  // forwards verbatim.
  const typedPost = await $typedFetch('/api/y', { method: 'POST' })
  const vanillaPost = await $fetch('/api/y', { method: 'POST' })

  type _methodCallIsVanillas = Expect<
    Equal<typeof typedPost, typeof vanillaPost>
  >

  // An external URL and a path built at run time are both legal through
  // vanilla, so both stay legal here.
  const external = await $typedFetch('https://example.com/thing')
  const built = await $typedFetch(String(Date.now()))

  return [typed, vanilla, typedPost, vanillaPost, external, built]
}

// ---------------------------------------------------------------------------
// The namespace is a FULL mirror, plus exactly one member
// ---------------------------------------------------------------------------

/**
 * Nitro's `$Fetch` is a single call signature plus exactly `raw` and `create`
 * — there is no `native` (that member is on ofetch's own interface, not on the
 * one the global is typed as) and no overload set.
 *
 * The second line is the control: it goes red the day Nitro grows a third
 * member, which is the day this mirror stops being one.
 */
type _vanillaHasExactlyTwoMembers = Expect<
  Equal<keyof typeof $fetch, 'raw' | 'create'>
>
type _namespaceIsVanillasPlusSafe = Expect<
  Equal<keyof typeof $typedFetch, keyof typeof $fetch | 'safe'>
>

/**
 * **`raw` is vanilla's own member**, indexed out of Nitro's declaration rather
 * than restated — so it cannot drift from the thing it passes through, and it
 * has no `.safe` of its own for the same reason vanilla's has none: its value
 * is the response object, which is orthogonal to the declared channel.
 */
type _rawIsVanillas = Expect<Equal<typeof $typedFetch.raw, typeof $fetch.raw>>

/**
 * **`create` returns the *typed* interface**. Returning a
 * vanilla `$Fetch` would be a silent typing cliff: the call compiles and
 * `.safe` vanishes one level later with no signal at all.
 */
const _created = $typedFetch.create({ baseURL: '/api' })

type _createStaysTyped = Expect<Equal<typeof _created, typeof $typedFetch>>

async function _createdInstanceKeepsTheUnion(): Promise<string> {
  const result = await _created.safe('/api/users/123')

  if (result.ok) return result.data.id

  // The same `.safe`, narrowing the same union — a created instance's sibling
  // is not a second one.
  switch (result.error.tag) {
    case 'user-not-found':
      return result.error.userId
    case 'user-suspended':
      return result.error.until
  }
}

// ---------------------------------------------------------------------------
// `.safe` on a declared route
// ---------------------------------------------------------------------------

/**
 * **The exhaustive `switch` is the assertion.** No `default`, and the function
 * promises a `string`, so an error union that had degraded to TypeScript's
 * error type — or to the shape floor, or to `any` — leaves the final
 * `return` missing and this is a real `TS2366`.
 *
 * `ok` is the discriminant and `error` is the **flat variant**: the wrapper has
 * already run the reader internally, and the `NuxtError` envelope is not
 * surfaced because it carries nothing a caller needs — the status is on the
 * variant, and both `message` and `statusMessage` are the tag.
 */
async function _safeNarrowsTheDeclaredUnion(): Promise<string> {
  const result = await $typedFetch.safe('/api/users/123')

  if (result.ok) return `ok:${result.data.id}`

  switch (result.error.tag) {
    case 'user-not-found':
      return `missing:${result.error.userId}`
    case 'user-suspended':
      return `suspended:${result.error.until}`
  }
}

/**
 * The same claim reached **after destructuring**, which is how call sites are
 * actually written. Destructuring is legal inside each branch and only there,
 * because the two arms carry different properties — which is exactly what makes
 * the collapse below necessary rather than cosmetic.
 */
async function _safeNarrowsAfterDestructuring(): Promise<string> {
  const result = await $typedFetch.safe('/api/users/123')

  if (result.ok) {
    const { data } = result

    return `ok:${data.id}`
  }

  const { error } = result

  switch (error.tag) {
    case 'user-not-found':
      return `missing:${error.userId}`
    case 'user-suspended':
      return `suspended:${error.until}`
  }
}

/**
 * **Neither arm is `any`.**
 *
 * Not decoration on this surface: every claim here goes through a *call*, and a
 * fixture program that cannot resolve ofetch's `FetchRequest` — it needs
 * `lib.dom`, which the base fixture config does not carry — infers the route
 * literal as `any` and hands back `unknown`, silently. `Equal<…>` passes with
 * `any` on either side, so it is `IsAny` that says the pairs above are about
 * this route rather than about nothing.
 */
type _SafeResult = Awaited<
  ReturnType<typeof $typedFetch.safe<unknown, '/api/users/:id'>>
>

// The control, without which both lines below would pass just as well against
// a result whose false arm had vanished: `IsAny<never>` is `false` too.
type _safeErrorArmIsInhabited = Expect<
  Equal<IsNever<Extract<_SafeResult, { ok: false }>>, false>
>
type _safeErrorIsNotAny = Expect<
  Equal<IsAny<Extract<_SafeResult, { ok: false }>['error']>, false>
>
type _safeDataIsNotAny = Expect<
  Equal<IsAny<Extract<_SafeResult, { ok: true }>['data']>, false>
>

/** The success arm carries Nitro's own success type, untouched. */
async function _safeDataIsVanillas(): Promise<unknown> {
  const result = await $typedFetch.safe('/api/users/123')
  const _vanilla = await $fetch('/api/users/123')

  type _dataIsVanillas = Expect<
    Equal<Extract<typeof result, { ok: true }>['data'], typeof _vanilla>
  >

  return result
}

// ---------------------------------------------------------------------------
// The undeclared collapse, which this surface needs for its own reason
// ---------------------------------------------------------------------------

/**
 * **A union member whose *property* is `never` is not itself `never`.** Without
 * the tuple-wrapped collapse in {@link TypedResult}, an undeclared route's
 * result keeps a `{ ok: false, error: never }` arm standing: `ok` stays
 * `boolean`, and `data` is unreachable without writing a branch that can never
 * be taken.
 *
 * The pair below is the whole of it. `_Collapsed` is one object type;
 * `_Uncollapsed` is the two-arm union the same alias produces when the route
 * really did declare something, which is the control.
 */
type _Collapsed = TypedResult<{ legacy: true }, never>
type _Uncollapsed = TypedResult<{ id: string }, UserFailure>

type _collapseLeavesOneArm = Expect<
  Equal<_Collapsed, { ok: true; data: { legacy: true } }>
>
type _declaredRouteKeepsTwoArms = Expect<
  Equal<
    _Uncollapsed,
    { ok: true; data: { id: string } } | { ok: false; error: UserFailure }
  >
>

/**
 * The same thing through a real call, and **after destructuring** — which is
 * the shape to verify, because it is how call sites will be
 * written. Both lines are a compile error without the collapse: `ok` would be
 * `boolean`, and `data` does not exist on the false arm.
 */
async function _undeclaredRouteDegradesToOneArm(): Promise<unknown> {
  const result = await $typedFetch.safe('/api/legacy')

  type _okIsTheLiteralTrue = Expect<Equal<typeof result.ok, true>>

  const { ok: _ok, data } = result

  type _okStaysTheLiteral = Expect<Equal<typeof _ok, true>>
  type _dataIsReachableDirectly = Expect<Equal<typeof data, { legacy: true }>>

  return data
}

/**
 * The presence-based method fallback, reached through `.safe`'s own
 * method parameter rather than through the lookup — the only thing that proves
 * the method reaches the lookup at all.
 *
 * Row 2: `post` is **present** on `/api/y` and unbranded, so the union is a
 * legitimate `never` and the result collapses. Row 1: no method named, `get`
 * absent, so the `default` handler's union — and the two together are what stop
 * "the method arrived" from being indistinguishable from "the lookup answered
 * `never` for everything".
 */
async function _methodReachesTheLookup(): Promise<string> {
  const posted = await $typedFetch.safe('/api/y', { method: 'POST' })

  type _presentMethodKeyCollapses = Expect<Equal<typeof posted.ok, true>>

  const fallback = await $typedFetch.safe('/api/y')

  if (fallback.ok) return posted.data.via

  switch (fallback.error.tag) {
    case 'unauthorized':
      return `${fallback.error.status}`
  }
}

/**
 * An external URL and a run-time-built path both degrade to the one-arm form
 * rather than to a compile error: a typed
 * wrapper must not reject what vanilla accepts.
 */
async function _undeclarablePathsDegrade(): Promise<unknown[]> {
  const external = await $typedFetch.safe('https://example.com/thing')
  const built = await $typedFetch.safe(String(Date.now()))

  type _externalCollapses = Expect<Equal<typeof external.ok, true>>
  type _builtCollapses = Expect<Equal<typeof built.ok, true>>

  return [external.data, built.data]
}

// ---------------------------------------------------------------------------
// The declaration shape, as a rendering pair
// ---------------------------------------------------------------------------

/**
 * The good half: a named `interface` with the value a `const` of that type —
 * exactly how Nitro declares its own global — renders as its own name.
 */
const _$typedFetch = $typedFetch

/**
 * The bad half, committed rather than described: the same namespace written as
 * an inline object type, which is what an implementer reaching for the obvious
 * spelling produces.
 *
 * Only the call signature and `safe` are written out — `raw` and `create` are
 * left off — so the measured pair is a **floor** on the regression rather than
 * a flattering maximum.
 */
declare const _bare$typedFetch: {
  <T = unknown, R extends string = string>(
    request: R,
    opts?: { method?: string }
  ): Promise<T>
  safe: <T = unknown, R extends string = string>(
    request: R,
    opts?: { method?: string }
  ) => Promise<TypedResult<T, never>>
}

/**
 * Everything above is either an `Expect<…>` alias, a function whose
 * exhaustiveness is the assertion, or a `const` a hover assertion reads — so
 * the file's own clean compilation is the assertion. These exports keep the
 * hover targets and the two throwing consts from being dead code.
 */
export {
  _$typedFetch,
  _bare$typedFetch,
  _typedThrown,
  _vanillaThrown,
  type $TypedFetch,
}
