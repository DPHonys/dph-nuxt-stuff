/**
 * `event.$typedFetch` at layer 1: the whole surface over a
 * hand-written stand-in for a generated map, with nothing running.
 *
 * The playground makes the same claims against a **real** Nuxt build — and it
 * is the only place the augmentation can be shown to have *bound*, since an
 * augmentation landing on a second physical `h3` is silent. This
 * file is the fast half: it says what the *rule* is, in one screen, and it keeps
 * saying it on the day a Nuxt or Nitro bump takes the real build down.
 *
 * Must compile with **zero** diagnostics.
 *
 * **Excluded from the package's own `tsconfig.json`, and it has to stay
 * excluded** — for the reason `./typed-fetch.ts`, `./lookup.ts` and
 * `./unreachable-map-key.ts` record: the `declare module 'nitropack/types'`
 * block below is an augmentation, an augmentation is global to whatever program
 * contains it, and one extra `InternalApi` key was measured to be enough to
 * turn an unrelated `$fetch` in this package into `TS2321 Excessive stack
 * depth`. The harness compiles it alone.
 */

import type { H3Event } from 'h3'
import type { NitroFetchRequest } from 'nitropack/types'
import type {
  Event$TypedFetch,
  TypedApiErrors,
} from '../../../src/runtime/types'
import type { Equal, Expect, IsAny, IsNever } from '../vocabulary'

/**
 * Imported for the **render's** sake rather than for an assertion: a name the
 * fixture does not import renders as `import("…").Name`, and the hover
 * budgets were measured in an editor, where a call site's own file has the name in
 * scope.
 */
type _RequestIsNitros = NitroFetchRequest

/** What `/api/users/:id` declares, on `get` only. */
type UserFailure =
  | { tag: 'user-not-found'; status: 404; userId: string }
  | { tag: 'user-suspended'; status: 403; until: string }

/** Nitro's own interface, standing in for a generated `nitro-routes.d.ts`. */
declare module 'nitropack/types' {
  interface InternalApi {
    '/api/users/:id': { get: { id: string } }
    '/api/legacy': { get: { legacy: true } }
  }
}

/** This module's map, keyed exactly as Nitro keys the interface above. */
declare module '../../../src/runtime/types' {
  interface TypedApiErrors {
    '/api/users/:id': { get: UserFailure }
    '/api/legacy': { get: never }
  }
}

/** Keeps the import above used; the augmentation needs the module named. */
type _MapIsAugmented = TypedApiErrors

/**
 * The event a Nitro handler receives.
 *
 * That `event.$typedFetch` resolves *at all* is the augmentation binding — but
 * only in **this** program, where `h3` is whatever the harness resolved. The
 * claim that it binds in a real app's server program is
 * `playground/server/api/event-typed-fetch-probe.get.ts`, compiled by `vue-tsc`
 * against the generated `tsconfig.server.json`, and it is not expressible here.
 */
declare const event: H3Event

// ---------------------------------------------------------------------------
// The namespace: the bare call signature plus the sibling, and nothing else
// ---------------------------------------------------------------------------

/**
 * **No `raw` and no `create`**, because that is exactly what `event.$fetch` is.
 *
 * Nitro types it `Base$Fetch<unknown, NitroFetchRequest>`
 * (`nitropack/dist/types/index.d.ts:230-236`) — a call signature with no
 * members at all, since it is a closure over h3's `fetchWithEvent` rather than
 * an ofetch instance. The second line is the control: without it, "our
 * namespace has exactly one member" would be indistinguishable from "`keyof`
 * stopped seeing members".
 *
 * The `neg/` half is `neg/event-fetch-namespace.ts`, where reaching for either
 * absent member is a real `TS2339` — which `keyof` alone could not show, since
 * an index signature would satisfy the line below and still hand a caller
 * `event.$typedFetch.create`.
 */
type _namespaceIsVanillasPlusSafe = Expect<
  Equal<keyof typeof event.$typedFetch, 'safe'>
>
type _vanillaHasNoMembersAtAll = Expect<IsNever<keyof typeof event.$fetch>>

/**
 * **`.safe` is the global's declaration, not a second one that can disagree**
 *. What genuinely differs between the two surfaces is the
 * *header merge*, which is run time.
 */
type _safeIsTheSameSignature = Expect<
  Equal<typeof event.$typedFetch.safe, typeof $typedFetch.safe>
>

/**
 * **It is not a copy of the global's namespace.** `$TypedFetch` has two members
 * this does not, so an implementer reaching for the obvious "reuse the
 * interface" would widen the completion list past what the thing underneath can
 * do.
 */
type _isNotTheGlobalsNamespace = Expect<
  Equal<Equal<Event$TypedFetch, typeof $typedFetch>, false>
>

// ---------------------------------------------------------------------------
// The degradation lock: the default entry point is a pure typings mirror of vanilla
// ---------------------------------------------------------------------------

/**
 * The byte-identity pair `test/types/event-typed-fetch.test.ts` renders against
 * each other — the strongest form the degradation lock has, and the one that
 * also catches two types being structurally equal while the typed answer has
 * grown an alias a caller would have to read through.
 */
const _typedThrown = event.$typedFetch('/api/users/123')
const _vanillaThrown = event.$fetch('/api/users/123')

async function _defaultEntryPointIsVanillas(): Promise<unknown[]> {
  const typed = await event.$typedFetch('/api/users/123')
  const vanilla = await event.$fetch('/api/users/123')

  type _successIsVanillas = Expect<Equal<typeof typed, typeof vanilla>>
  type _successIsTheRoutes = Expect<Equal<typeof typed, { id: string }>>

  // An external URL and a path built at run time are both legal through
  // vanilla, so both stay legal here.
  const external = await event.$typedFetch('https://example.com/thing')
  const built = await event.$typedFetch(String(Date.now()))

  return [typed, vanilla, external, built]
}

// ---------------------------------------------------------------------------
// `.safe` on a declared callee
// ---------------------------------------------------------------------------

/**
 * **The exhaustive `switch` is the assertion.** No `default`, and the function
 * promises a `string`, so an error union that had degraded to TypeScript's
 * error type — or to the wire's shape floor, or to `any` — leaves the final
 * `return` missing and this is a real `TS2366`.
 *
 * This is the server-to-server worked example in miniature, and it is the shape
 * the depth rule warns about: a handler whose return type is *inferred*
 * from a call like this one needs an explicit annotation, which is what every
 * chain route in the playground writes.
 */
async function _safeNarrowsTheCalleesUnion(): Promise<string> {
  const result = await event.$typedFetch.safe('/api/users/123')

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
 * actually written.
 */
async function _safeNarrowsAfterDestructuring(): Promise<string> {
  const result = await event.$typedFetch.safe('/api/users/123')

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
 * **Neither arm is `any`**, and it is not decoration
 * here: every claim above goes through a *call*, and a fixture program that
 * cannot resolve ofetch's `FetchRequest` — which needs `lib.dom`, absent from
 * the base fixture config — infers the route literal as `any` and hands back
 * `unknown`, silently.
 */
type _SafeResult = Awaited<
  ReturnType<typeof event.$typedFetch.safe<unknown, '/api/users/:id'>>
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

// ---------------------------------------------------------------------------
// The undeclared collapse
// ---------------------------------------------------------------------------

/**
 * A callee that declared nothing has **one arm**, so `ok` is the literal `true`
 * and `data` is reachable with no branch — including after destructuring, which
 * is the shape to verify. Without {@link TypedResult}'s
 * tuple-wrapped collapse `ok` would be `boolean` and both lines below would be
 * compile errors.
 */
async function _undeclaredCalleeDegradesToOneArm(): Promise<unknown> {
  const result = await event.$typedFetch.safe('/api/legacy')

  type _okIsTheLiteralTrue = Expect<Equal<typeof result.ok, true>>

  const { ok: _ok, data } = result

  type _dataIsReachableDirectly = Expect<Equal<typeof data, { legacy: true }>>

  return data
}

// ---------------------------------------------------------------------------
// The declaration shape, as a rendering target
// ---------------------------------------------------------------------------

/**
 * A named `interface` reached through a property renders as its own name. The
 * bad half — the same namespace written inline — is committed in
 * `./typed-fetch.ts` and measured there; what is measured here is that reaching
 * it through `event.` costs nothing extra.
 */
const _event$TypedFetch = event.$typedFetch

/**
 * Everything above is either an `Expect<…>` alias, a function whose
 * exhaustiveness is the assertion, or a `const` a hover assertion reads — so
 * the file's own clean compilation is the assertion. These exports keep the
 * hover targets and the two throwing consts from being dead code.
 */
export {
  _event$TypedFetch,
  _typedThrown,
  _vanillaThrown,
  type Event$TypedFetch,
}
