/**
 * The `@dphonys/nuxt-handler-errors/types` entry point.
 *
 * This is the emitter's augmentation target *and* the whole public type surface
 * (SPEC.md §3). It has to be a real module rather than an ambient declaration
 * file: a non-exported `declare const … : unique symbol` does not survive
 * declaration emit from a published entry point (SPEC.md §8.2), which is why
 * the two phantom symbols below are real `Symbol()` values.
 *
 * Everything exported from here is public API for good (SPEC.md §8.1): a
 * catalogue's own emitted `.d.ts` is an *unevaluated*
 * `ErrorCatalogue<VariantsOf<{…}>>`, so these names travel to every consumer
 * whether or not they are ever written by hand.
 */

import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
  RouterMethod,
} from 'h3'
import type {
  $Fetch,
  Base$Fetch,
  ExtractedRouteMethod,
  MatchedRoutes,
  NitroFetchOptions,
  NitroFetchRequest,
  Serialize,
  TypedInternalResponse,
} from 'nitropack/types'
import type { ComputedRef, Ref } from 'vue'

// ---------------------------------------------------------------------------
// Phantom slots
// ---------------------------------------------------------------------------

/**
 * The slot `payload<T>()` parks its type argument in.
 *
 * A real `Symbol()` rather than an ambient `declare const`: SPEC.md §8.2 fact 2
 * measured that a non-exported `unique symbol` is dropped by declaration emit
 * from a published entry point, which silently unbrands every catalogue a
 * consumer imports. Hovers are unchanged either way.
 */
export const PAYLOAD: unique symbol = Symbol('nuxt-handler-errors:payload')

/** The slot a catalogue parks its variant union in. Same reasoning as `PAYLOAD`. */
export const ERRORS: unique symbol = Symbol('nuxt-handler-errors:errors')

/**
 * A variant's payload type, marked. The runtime value is inert — only the type
 * argument matters, and it is read back out by {@link VariantsOf}.
 */
export interface Payload<P> {
  readonly [PAYLOAD]?: P
}

// ---------------------------------------------------------------------------
// Declaring a variant
// ---------------------------------------------------------------------------

/**
 * Constrained but open, so `status` gets completions and reads wrong when it is
 * wrong without closing the set (SPEC.md §3.2).
 *
 * There is deliberately **no default**. A defaulted 400 makes a variant's
 * status invisible where it is declared and quietly turns 404/409/403 into
 * 400s.
 */
export type ErrorStatus =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 409
  | 410
  | 422
  | 429
  | 500
  | 501
  | 502
  | 503
  | 504
  // The open arm. `number` alone would swallow the literal completions above.
  | (number & {})

/** One entry of a `defineErrors` object literal. */
export interface VariantDef {
  status: ErrorStatus
  payload?: Payload<any>
}

/**
 * The wire-guaranteed floor every variant meets (SPEC.md §5.3): a string `tag`
 * and a number `status`. Payload keys are unconstrained.
 */
export interface AnyVariant {
  tag: string
  status: number
}

/**
 * A catalogue definition, flattened into the discriminated union it declares.
 *
 * `const` on `defineErrors`' type parameter is what keeps `status: 404` a `404`
 * and a payload union that union, all the way through the generated map.
 */
export type VariantsOf<D extends Record<string, VariantDef>> = {
  [K in keyof D & string]: { tag: K; status: D[K]['status'] } & (D[K] extends {
    payload: Payload<infer P>
  }
    ? P
    : // `{}` is the identity element for `&`, which is exactly what a
      // payload-less variant needs (SPEC.md §8.2 fact 1).
      // eslint-disable-next-line ts/no-empty-object-type
      {})
}[keyof D & string]

/** One variant's payload fields — the variant minus the two reserved names. */
export type PayloadOf<E extends AnyVariant, T extends E['tag']> = Omit<
  Extract<E, { tag: T }>,
  'tag' | 'status'
>

/**
 * Variadic on purpose: a payload-less variant takes **no** second argument, and
 * passing one is an error rather than an ignored extra (SPEC.md §3.1).
 *
 * The never-check is tuple-wrapped, as SPEC.md §9.5 rule 2 requires of every
 * never-check in this repo — the code must not use a weaker form than the suite
 * that tests it.
 */
export type PayloadArgs<E extends AnyVariant, T extends E['tag']> = [
  keyof PayloadOf<E, T>,
] extends [never]
  ? []
  : [payload: PayloadOf<E, T>]

// ---------------------------------------------------------------------------
// The serialization guard on `payload<T>()`
// ---------------------------------------------------------------------------

type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Whether one field type comes out the other side of Nitro's `Serialize`.
 *
 * Nitro's `Serialize` is the authority rather than a hand-written list, so this
 * cannot drift from what the generated map will actually say. Three arms sit in
 * front of it:
 *
 * - `any` survives, because `Serialize<any>` is `any` and rejecting it would
 *   punish untyped code for being untyped.
 * - `unknown` and `void` map to `never` *silently*, and neither is caught by
 *   the `Serialize` check below once `Exclude` has been applied, so they are
 *   named here.
 * - `undefined` is excluded before the check, because an **optional** field is
 *   `T | undefined` and it is the `T` half that has to survive. Without this,
 *   `amount?: bigint` serializes to `undefined` — not `never` — and walks
 *   straight through.
 */
type SurvivesSerialization<V> =
  IsAny<V> extends true
    ? true
    : unknown extends V
      ? false
      : [V] extends [void]
        ? false
        : [Serialize<Exclude<V, undefined>>] extends [never]
          ? false
          : true

/**
 * The top-level payload fields that do not survive `Serialize`.
 *
 * **Top-level, and that is a deliberate floor.** Catching a nested `bigint`
 * needs the guard to recurse into field types, and the only cheap way to
 * recurse — a self-referential index signature — rejects every named
 * `interface`, which SPEC.md §8.3(c) *mandates* for array-valued payload
 * fields. A false positive there is unappealable by the author; a missed
 * nesting level is not.
 */
export type UnserializablePayloadFields<T> = {
  [K in keyof T]-?: SurvivesSerialization<T[K]> extends true ? never : K
}[keyof T]

/**
 * `payload<T>()`'s constraint (SPEC.md §3.2).
 *
 * This is a correctness requirement rather than hygiene: a `bigint` does not
 * merely vanish from the client's type, it makes `JSON.stringify` **throw**
 * inside Nitro's serializer, turning a declared 403 into a genuine unhandled
 * 500. `Date` → `string` is fine and must not be rejected.
 *
 * The clean branch is `unknown`, not `T`: a constraint that resolves to its own
 * type parameter is reported as circular. The failing branch is a required
 * property whose type is a template literal, for the same reason
 * {@link ConflictGuard} is — a branded marker type renders as its own name and
 * says nothing, while a missing property puts the offending field verbatim into
 * the diagnostic.
 */
export type SerializablePayload<T> = [UnserializablePayloadFields<T>] extends [
  never,
]
  ? unknown
  : {
      __unserializablePayloadField__: `Payload field does not survive JSON serialization: ${UnserializablePayloadFields<T> & string}`
    }

// ---------------------------------------------------------------------------
// Catalogues
// ---------------------------------------------------------------------------

/**
 * A named, reusable set of variants — the product of `defineErrors`, and a real
 * runtime value.
 */
export interface ErrorCatalogue<E extends AnyVariant> {
  readonly [ERRORS]?: E

  /**
   * Narrow the catalogue to a subset.
   *
   * About honesty rather than convenience (SPEC.md §3.2): a route listing an
   * eight-variant catalogue it can only produce two of has published a contract
   * for six failures it will never emit.
   */
  pick: <const K extends readonly E['tag'][]>(
    ...tags: K
  ) => ErrorCatalogue<Extract<E, { tag: K[number] }>>

  /**
   * Raise a variant from helper code below the handler frame — the documented
   * escape hatch, and **deliberately unenforced** (SPEC.md §6.3). It can throw
   * a variant the calling route never declared, and nothing checks that. Rank
   * it below `fail`, never beside it.
   */
  raise: <T extends E['tag']>(tag: T, ...payload: PayloadArgs<E, T>) => never
}

/** The element type of a composition array. */
export type AnyCatalogue = ErrorCatalogue<any>

/**
 * Composition is a homogeneous array of catalogue values, which keeps the merge
 * to one indexed access (SPEC.md §3.2).
 */
export type UnionOfCatalogues<C extends readonly AnyCatalogue[]> = {
  [I in keyof C]: C[I] extends ErrorCatalogue<infer E> ? E : never
}[number]

type IsUnion<T, U = T> = T extends any
  ? [U] extends [T]
    ? false
    : true
  : never

/**
 * The tags declared more than once across composed catalogues, **flat**.
 *
 * One distributive pass, no tuple recursion, so the check stays out of the
 * deferred-generic position where this repo's compiler has been seen to give up
 * (SPEC.md §3.2). Two catalogues declaring an *identical* member collapse to
 * one union member, `IsUnion` is false, and composition compiles clean — only a
 * genuine divergence in status or payload trips it.
 */
export type DuplicateTags<E extends AnyVariant> = {
  [K in E['tag']]: IsUnion<Extract<E, { tag: K }>> extends true ? K : never
}[E['tag']]

/**
 * Surfaces a duplicate tag as a **missing required property whose type is a
 * template literal**, so the colliding tag appears verbatim in the diagnostic.
 *
 * **Must be intersected FIRST** — `ConflictGuard<C> & { errors: C }`, never the
 * reverse. TypeScript truncates the *tail* of a rendered type at creation time
 * and `ErrorCatalogue<VariantsOf<{…}>>` is long enough to bury the message, so
 * guard-last detects the collision and renders `… & { ......'`, leaving the
 * developer with no idea which tag collided. A plain branded marker type is no
 * better: it renders as its own name. This is a measured usability mandate, not
 * style (SPEC.md §3.2), and it is under test.
 */
export type ConflictGuard<C extends readonly AnyCatalogue[]> = [
  DuplicateTags<UnionOfCatalogues<C>>,
] extends [never]
  ? // No conflict means the guard contributes nothing to `{ errors: C }`, and
    // `{}` is the identity element for `&` (SPEC.md §8.2 fact 1).
    // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __duplicateErrorTag__: `Duplicate error tag across composed catalogues: ${DuplicateTags<UnionOfCatalogues<C>> & string}`
    }

// ---------------------------------------------------------------------------
// The brand
// ---------------------------------------------------------------------------

/**
 * The brand (SPEC.md §4.1): a route's declared union, attached as an
 * **optional phantom property** on an interface extending h3's `EventHandler`.
 *
 * This is idiomatic rather than a trick — h3's own `EventHandler` is already an
 * interface carrying a call signature plus optional marker properties
 * (`__is_handler__?`, `__resolve__?`, `__websocket__?`).
 *
 * Why the brand and the response payload can never collide: `ReturnType` reads
 * only the call signature and `Serialize` runs after it, so the two occupy
 * **disjoint type positions**. Vanilla `useFetch` stays clean structurally,
 * not by discipline.
 *
 * The property is optional so that any plain `EventHandler` still inhabits this
 * type.
 */
export interface TypedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Errors = never,
> extends EventHandler<Request, Response> {
  __declaredErrors__?: Errors
}

/**
 * Recover a route's declared union from its handler type (SPEC.md §4.3).
 *
 * This is the lock the whole design rests on: the union travels on the handler
 * **type** and never appears in the handler's return type, so the emitted map
 * can read it out per route while vanilla `useFetch` never sees it.
 *
 * Three behaviours, and each is a separate mandate:
 *
 * - **A branded handler yields its union exactly.** `Exclude<…, undefined>`
 *   keeps an `undefined` arm out of the answer whatever put one in the slot.
 *   Measured: `infer` on an *optional* property yields the declared type on its
 *   own, with or without `exactOptionalPropertyTypes`, so this only bites a
 *   hand-written brand — which is exactly the case a handler arriving from a
 *   Nuxt layer or a published package is.
 * - **An unbranded handler yields `never`, with no special case.** A plain
 *   `EventHandler` has no property in common with a target whose only member is
 *   optional, so the relation fails and the false branch — `never` — is taken.
 *   The fallback is `never` rather than `unknown` because an unbranded route is
 *   an *undeclared* route, which is the documented silent default (§6.1).
 * - **`any` yields `never`, and the guard is required** (SPEC.md §4.3 mandate
 *   1). Without it a `.js` or untyped route matches the true branch with
 *   `E = unknown`, and `unknown` destroys narrowing at every call site that
 *   touches it — the failure is silent and it spreads. It is also what makes
 *   §6.6's mutual-recursion case degrade safely, so it is not politeness.
 *
 * The `Safe` in the name is that guard. There is deliberately no unguarded
 * `ExtractErrors` beside it: a second spelling of this would only ever be the
 * wrong one to reach for.
 */
export type ExtractErrorsSafe<T> =
  IsAny<T> extends true
    ? never
    : T extends { __declaredErrors__?: infer E }
      ? Exclude<E, undefined>
      : never

/**
 * Scoped to exactly the declared union, and returns `never`.
 *
 * It throws at runtime. `return fail(…)` is idiomatic rather than required, but
 * makes the exit obvious and sidesteps every control-flow-analysis edge case —
 * and because it is `never`, returning it contributes **nothing** to the
 * handler's inferred return type. That is the property the whole client side
 * depends on (SPEC.md §3.1).
 */
export type Fail<E extends AnyVariant> = <T extends E['tag']>(
  tag: T,
  ...payload: PayloadArgs<E, T>
) => never

/** The second argument a typed handler body receives. */
export interface TypedHandlerContext<E extends AnyVariant> {
  fail: Fail<E>
}

/** A typed handler body. The success type infers from it with no annotation. */
export type TypedHandlerFn<
  Request extends EventHandlerRequest,
  Response,
  E extends AnyVariant,
> = (event: H3Event<Request>, ctx: TypedHandlerContext<E>) => Response

// ---------------------------------------------------------------------------
// The callable surfaces
// ---------------------------------------------------------------------------

/**
 * Every callable is declared as a named `interface` with the value a `const` of
 * that type (SPEC.md §8.3(b)). Measured on the prototype: **1075 characters**
 * as a bare `function` declaration against **55** as a named interface, because
 * a named interface renders as its own name. Vanilla `useFetch` is declared
 * this way for exactly this reason.
 */
export interface DefinePayload {
  <T extends SerializablePayload<T>>(): Payload<T>
}

/** See {@link DefinePayload} for why this is an interface. */
export interface DefineErrors {
  <const D extends Record<string, VariantDef>>(
    defs: D
  ): ErrorCatalogue<VariantsOf<D>>
}

/**
 * The server declaration surface (SPEC.md §3.1). See {@link DefinePayload} for
 * why this is an interface.
 *
 * **Options object first, handler last**, chosen over h3's single-object
 * `EventHandlerObject` form so the declaration sits visibly at the top of the
 * route file and future options land in the existing object rather than in a
 * third positional parameter.
 *
 * **`Response` has no default type parameter.** That is what makes an explicit
 * type argument `TS2558: Expected 2-3 type arguments, but got 1` instead of a
 * silent collapse of the success type to `any`. The trap is unrepresentable
 * rather than merely documented.
 */
export interface DefineTypedEventHandler {
  <
    const C extends readonly AnyCatalogue[],
    Response extends EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: ConflictGuard<C> & { errors: C },
    handler: TypedHandlerFn<Request, Response, UnionOfCatalogues<C>>
  ): TypedEventHandler<Request, Response, UnionOfCatalogues<C>>
}

// ---------------------------------------------------------------------------
// Hover legibility
// ---------------------------------------------------------------------------

/**
 * A distributive identity mapped type that forces evaluation (SPEC.md §8.3(a)).
 *
 * Structurally lossless in both directions and distributive, so a union stays a
 * union of flat members rather than collapsing into one merged object. What it
 * changes is the *shape of the type object*: a variant is declared as
 * `{ tag; status } & P` — an intersection — and mapping over it produces a
 * single object type, which is what a hover and a diagnostic then render.
 *
 * `T extends unknown` is the distributivity trigger.
 *
 * **What it was mandated for, and what it was measured to do.** §8.3(a) records
 * that a union forwarded on as a *type argument* — which is what every
 * `DeclaredErrorBody<…>` and `NuxtError<…>` declaration does — leaves
 * `Simplify<Serialize<…>>` unevaluated and renders the wrapper's `Serialize`
 * residue, and that this alias is the fix. Re-measured through the compile-time
 * harness on the pinned `typescript-native-bridge`, **that fix does not
 * reproduce**: `Simplify<Serialize<…>>` is already evaluated, and a type
 * argument renders as its alias chain either way, so wrapping it makes the
 * render one name *longer*. The intersection collapse above is the one
 * rendering effect that does reproduce. The full measurement, and what ticket
 * 10 has to re-take against the real playground, is in the implementation
 * effort's SPEC-AMENDMENTS record.
 */
export type Flatten<T> = T extends unknown ? { [K in keyof T]: T[K] } : never

// ---------------------------------------------------------------------------
// The generated map, and the wire
// ---------------------------------------------------------------------------

/**
 * The generated route → declared-errors map, keyed exactly like Nitro's
 * `InternalApi`. The build-time emitter reopens this interface with
 * `declare module '@dphonys/nuxt-handler-errors/types'`; empty means no handler
 * has declared anything yet (SPEC.md §4.2).
 */
export interface TypedApiErrors {}

/**
 * **The lookup**: a route's declared union, named from its path alone
 * (SPEC.md §4.3, §3.6).
 *
 * ```ts
 * import type { DeclaredErrorsOf } from '@dphonys/nuxt-handler-errors/types'
 *
 * function toOrderFailure(e: DeclaredErrorsOf<'/api/users/:id'>): OrderTag {
 *   switch (e.tag) { … }
 * }
 * ```
 *
 * This is public API whether or not it is ever hand-written (SPEC.md §8.1):
 * `$typedFetch.safe`'s emitted signature carries it **unevaluated**, so the
 * name travels to every consumer regardless.
 *
 * ## `MatchedRoutes` is Nitro's, on purpose
 *
 * `'/api/users/123'` finds the `'/api/users/:id'` entry by the *same* glob and
 * parameter scoring Nitro uses for the success type, because it is literally
 * the same type. The emitter keys this map exactly as Nitro keys `InternalApi`
 * (SPEC.md §4.2), which is what makes reuse possible rather than a
 * near-miss reimplementation — and it is also the structural safety property
 * behind SPEC.md §4.5's dev-server race: `MatchedRoutes` derives its key
 * universe from `keyof InternalApi`, so a key this map holds and Nitro's
 * interface does not is **unreachable by construction**, whatever it says.
 *
 * ## The method fallback is PRESENCE-based, and the divergence is required
 *
 * Nitro falls back to its `default` handler when a method lookup yields
 * `never`. That is safe for Nitro, whose serialized success type is never
 * `never`. Here `never` is a **legitimate value** — it is exactly what an
 * unbranded handler yields — so copying Nitro's rule would hand a `POST` caller
 * the `default` handler's errors, which is a *wrong* error type rather than an
 * absent one:
 *
 * ```
 * server/api/y.ts       → default, branded, declares E
 * server/api/y.post.ts  → post,    unbranded, declares nothing
 * map: '/api/y': { default: E, post: never }
 * ```
 *
 * Falling back on key **presence** instead is a *mirror of the h3 dispatcher,
 * not an approximation of it*: h3 registers Nitro's `default` handlers under
 * `"all"` (`h3@1.15.11/dist/index.mjs:2198`) and dispatches
 * `matched.handlers[method] || matched.handlers.all` (`:2217`) — method-specific
 * first, on presence. Three rows, all asserted against the real playground in
 * `playground/server/api/method-fallback.ts`:
 *
 * | Call | Resolves | Runtime runs |
 * | --- | --- | --- |
 * | `('/api/y')` | `get` absent → `default` → `E` | `handlers.all` |
 * | `('/api/y', { method: 'POST' })` | `post` present → `never` | `handlers.post` |
 * | `('/api/y', { method: 'DELETE' })` | `delete` absent → `default` → `E` | `handlers.all` |
 *
 * Nitro's success side agrees on all three, so `data` and `error` stay in
 * lockstep. h3's *cross-route* fallthrough (`POST /api/files/meta` walking up to
 * `/api/files/**`'s `all` handler) is deliberately **not** modelled: Nitro's
 * `AvailableRouterMethod` restricts the method set to the route's own keys, so
 * that call is already a compile error through the typed surface. The block is
 * inherited from vanilla rather than re-implemented here.
 *
 * ## `never` means "declares no failures", not "cannot fail"
 *
 * An undeclared route — one that never opted in, or a path this app does not
 * serve at all — resolves to `never`, never to `unknown` (which destroys
 * narrowing) and never to a compile error. `R` is deliberately unconstrained
 * beyond `string`: constraining it to `keyof TypedApiErrors & string` would
 * reject external URLs and dynamically-built paths and would break the
 * byte-identical completion list vanilla `useFetch` offers, which SPEC.md §6.1's
 * degradation lock forbids.
 *
 * **The accepted cost, stated plainly: `never` is silent.** A developer using a
 * typed wrapper on a route that never opted in gets *no signal at all*. Every
 * wrapper carrying this into a generic position needs an explicit
 * `[Declared] extends [never]` collapse, because `never`'s absorbing behaviour
 * does not propagate outward through a wrapper type (SPEC.md §6.1).
 *
 * ## Two things this cannot promise
 *
 * - **Not every map entry is inhabited.** Nuxt registers its island renderer as
 *   `#internal/nuxt/island-renderer`, which `resolveNitroPath` does not resolve,
 *   so `TypedApiErrors['/__nuxt_island/**']['default']` is TypeScript's *error
 *   type* — it renders as `any`, is not `any`, and satisfies every conditional
 *   and constraint it meets. `MatchedRoutes<'/__nuxt_island/foo'>` reaches it.
 *   Recorded rather than guarded: the only fix is a filesystem read inside the
 *   pure emitter, which SPEC.md §4.6 forbids. Measured in
 *   `test/generated-map.test.ts`.
 * - **A wrong answer under version skew.** A tag the client does not know comes
 *   back typed as a member it is not (SPEC.md §6.4).
 *
 * @typeParam R - The route path as written at the call site. Any string.
 * @typeParam M - The HTTP method, in either case. Defaults to `'get'`, which is
 * vanilla's default method, so the common form names only the route.
 */
export type DeclaredErrorsOf<
  R extends string,
  // SPEC.md §4.3 writes this constraint as `RouterMethod`, which is
  // **lowercase only** — and mandate 2 of the same section says both `'DELETE'`
  // and `'delete'` are accepted, normalised by the `Lowercase<M>` below. Both
  // cases are therefore admitted here, which is exactly the pair vanilla admits
  // (`Uppercase<AvailableRouterMethod<R>> | AvailableRouterMethod<R>`), and a
  // method that is neither is rejected rather than silently falling through to
  // `default` — the one place in this type where a wrong answer is preferable
  // to no answer, so it is not given.
  //
  // Measured against the two deferred positions tickets 10/11 will call from:
  // `ExtractedRouteMethod<R, O>` and a naked `M extends AvailableRouterMethod<R>`
  // both satisfy it with `R` and `O` unresolved. A raw `O['method']` does not —
  // use Nitro's own `ExtractedRouteMethod`, which is SPEC.md §10.3's Option 1
  // spelling anyway.
  M extends RouterMethod | Uppercase<RouterMethod> = 'get',
> =
  MatchedRoutes<R> extends infer Key
    ? // Distributes: a glob and a parametrised key can both match, and each
      // matched key gets its own answer. It is also the totality guard — a
      // route Nitro knows and this map does not (the other side of the
      // dev-server window) answers `never` rather than `TS2536`.
      Key extends keyof TypedApiErrors
      ? Lowercase<M> extends keyof TypedApiErrors[Key]
        ? TypedApiErrors[Key][Lowercase<M>]
        : 'default' extends keyof TypedApiErrors[Key]
          ? TypedApiErrors[Key]['default']
          : never
      : never
    : never

/**
 * The reserved key's type, derived from the exported constant so that the
 * literal itself is written in exactly one place (SPEC.md §5.2). A `typeof
 * import(…)` in a type position emits no runtime import, so this does not make
 * `/types` depend on `/shared` at run time.
 */
export type DeclaredErrorKey = (typeof import('./shared'))['DECLARED_ERROR_KEY']

/**
 * Nitro's production error body with the marker inside `data` (SPEC.md §5.1).
 *
 * `data` is the only extension point across both hops — `H3Error.toJSON()`
 * emits only `{message, statusCode, statusMessage?, data?}` and the SSR payload
 * reducer/reviver round-trips through exactly that. Since ofetch's
 * `FetchError.data` *is* the whole response body, the variant sits three hops
 * deep at `err.data.data.__declaredError__`.
 */
export interface DeclaredErrorBody<E extends AnyVariant> {
  error: true
  url: string
  statusCode: number
  statusMessage: string
  message: string
  data: { [K in DeclaredErrorKey]: E }
}

// ---------------------------------------------------------------------------
// The readers
// ---------------------------------------------------------------------------

/**
 * The error value {@link DeclaredErrorReader}'s first overload matches
 * (SPEC.md §3.7).
 *
 * SPEC.md §3.7 writes that parameter as `NuxtError<DeclaredErrorBody<E>>`, and
 * this is that shape reduced to the one property the reader actually walks.
 * Three reasons, in descending order of weight:
 *
 * - **`NuxtError` is not importable from here.** `/shared` and `/types` resolve
 *   from a consumer's server and `shared/` directories as well as from the
 *   client, and `#app` exists in none of the first two. Naming it would also
 *   make Nuxt's own error type part of this module's published signature
 *   (SPEC.md §8.1) for no gain.
 * - **Structural is what the reader is.** It reads a path, not a class. h3's
 *   `H3Error`, ofetch's `FetchError`, Nuxt's `NuxtError` and the object a test
 *   hands it all inhabit this, which is exactly the set of things that can
 *   legitimately carry the envelope.
 * - **It keeps the degraded overload reachable.** An undeclared route's error
 *   is `NuxtError<unknown>`, whose `data?: unknown` is *not* assignable to
 *   `DeclaredErrorBody<E>` for any `E` — so it falls to the second overload
 *   rather than matching the first with `E` silently widened.
 */
export interface DeclaredErrorCarrier<E extends AnyVariant> {
  data?: DeclaredErrorBody<E> | undefined
}

/**
 * The value form of the reader (SPEC.md §3.7): the one and only read path from
 * an error value to its declared variant.
 *
 * **No call site ever writes the wire key.** The honest address is
 * `err.data.data.__declaredError__` — three property hops, two of them optional,
 * ending on a key SPEC.md §5.2 froze as *renameable* protocol. Left raw, that
 * address gets typed by hand at every call site, which quietly converts a
 * protocol detail into a breaking change for every consumer.
 *
 * ## Two overloads, and what each one is for
 *
 * 1. The caller holds an error whose static type carries a declared union, so
 *    the union comes back out and narrows on `tag` with payloads intact.
 * 2. The caller holds anything else — a `catch` binding, an undeclared route's
 *    `NuxtError<unknown>`, a value from a library. The answer degrades to
 *    SPEC.md §5.3's **shape floor**, which is the whole evidence the wire
 *    guarantees: a string `tag` and a number `status`.
 *
 * ## What `undefined` means
 *
 * It means **"not a declared failure"**. SPEC.md §3.7 consequence 2: declared and
 * undeclared stay separate channels by **presence**, not by union — the error
 * channel is exactly vanilla's, and no caller pays a narrowing tax to reach a
 * 500's status. `undefined` covers three distinct states on purpose, because
 * nothing on the wire distinguishes them: no marker at all, a marker whose
 * shape floor is unmet, and a production-stripped response whose `data` Nitro
 * wiped (SPEC.md §6.5).
 *
 * ## What it cannot tell you
 *
 * A tag the client's generated union does not know (SPEC.md §6.4). The union
 * stays **closed** — SPEC.md §6.2 measured the widened alternative and it does
 * not cost a fallback branch, it costs **all** narrowing — so under deploy skew
 * an unrecognised
 * tag comes back typed as a member it is not and reaches whatever fallback the
 * caller wrote. A recognised/unrecognised flag is not computable either: the
 * map is type-level only (SPEC.md §4.4), so a client holds no runtime list of a
 * route's declared tags.
 *
 * Declared as a named `interface` with the value a `const` of that type, per
 * SPEC.md §8.3(b) — see {@link DefinePayload}.
 */
export interface DeclaredErrorReader {
  <E extends AnyVariant>(
    error: DeclaredErrorCarrier<E> | null | undefined
  ): E | undefined
  (error: unknown): AnyVariant | undefined
}

/**
 * The reactive sibling (SPEC.md §3.7): the same answer, as a computed.
 *
 * **Narrowing must land on a local `const`.** That is SPEC.md §3.7's
 * consequence 1 and it is the reason this returns a computed of the variant
 * rather than something a template reads through: a `.value` read does not
 * carry a narrowing across, and template narrowing is weaker still. The shape
 * that works is
 *
 * ```ts
 * const failure = useDeclaredError(error)
 * const current = failure.value        // ← the local const
 * if (current) switch (current.tag) { … }
 * ```
 *
 * See {@link DeclaredErrorReader} for what the two overloads answer and what
 * `undefined` means; this one only adds the `computed` wrapper.
 *
 * The parameter is Vue's own `Ref`, which SPEC.md §3.7 spells it as. A
 * narrower read-only `{ readonly value: T }` view was written first, on the
 * theory that `Ref`'s getter/setter pair makes it invariant in `T` and would
 * reject the ref a caller actually holds. **Measured, it does not**: object
 * property assignability is covariant in TypeScript whether or not the property
 * is writable, and a `Ref<NuxtError<DeclaredErrorBody<…>> | undefined>`,
 * a `ComputedRef`, a `ShallowRef` and a `Readonly<Ref<…>>` all match a
 * `Ref<DeclaredErrorCarrier<E> | null | undefined>` parameter with `E`
 * inferring correctly. The read-only view was therefore one exported type
 * (SPEC.md §8.1) buying nothing, and it is gone.
 */
export interface UseDeclaredError {
  <E extends AnyVariant>(
    error: Ref<DeclaredErrorCarrier<E> | null | undefined>
  ): ComputedRef<E | undefined>
  (error: Ref<unknown>): ComputedRef<AnyVariant | undefined>
}

// ---------------------------------------------------------------------------
// The imperative fetch surface (SPEC.md §3.5)
// ---------------------------------------------------------------------------

/**
 * ofetch's `FetchOptions`, reached through Nitro's own `create` signature
 * rather than through a fifth runtime dependency.
 *
 * `ofetch` is not a dependency of this package and SPEC.md §7.2's rule is that
 * one is added only when instance identity demands it — which is a runtime
 * property, and nothing here has a runtime. Indexing Nitro's own declaration is
 * exact by construction: whatever `$fetch.create` accepts is what
 * {@link $TypedFetch.create} accepts, on the day Nitro changes it as well as
 * today.
 */
type FetchDefaults = Parameters<$Fetch['create']>[0]

/**
 * The declared union for one call, computed from the request and the method
 * alone (SPEC.md §4.3).
 *
 * The `R extends string` guard is not decoration: `NitroFetchRequest` also
 * admits a `Request` object, which no route path can be read out of, so a
 * non-string request is an undeclared route by construction.
 *
 * `M` is already constrained to `RouterMethod`, which is a subset of
 * {@link DeclaredErrorsOf}'s own `RouterMethod | Uppercase<RouterMethod>`, so
 * no second guard is needed on this surface — unlike the composable's, whose
 * `Method` parameter is vanilla's own either-case set.
 *
 * A twin of this lives in `src/runtime/app/use-typed-fetch.ts` and the two are
 * deliberately not shared: making it common would mean exporting it from this
 * file, and SPEC.md §8.1 makes every name here public API for good. Six lines
 * of duplication is the cheaper of the two costs.
 */
type DeclaredErrorsForCall<R, M extends RouterMethod> = R extends string
  ? DeclaredErrorsOf<R, M>
  : never

/**
 * What `$typedFetch.safe` resolves to (SPEC.md §3.5).
 *
 * ```ts
 * const r = await $typedFetch.safe('/api/users/123')
 * if (!r.ok) {
 *   switch (r.error.tag) { … }   // the route's declared union, narrowed
 * }
 * ```
 *
 * ## The `[Declared] extends [never]` collapse is mandatory
 *
 * And for a reason that is *not* the one the composable needed it for. **A
 * union member whose *property* is `never` is not itself `never`**, so the
 * naive two-arm declaration leaves `{ ok: false, error: never }` standing on an
 * undeclared route: `ok` stays `boolean`, and `data` is unreachable without
 * writing a branch that can never be taken. With the collapse an undeclared
 * route's result is one object type, `ok` narrows to the literal `true`, and
 * SPEC.md §6.1's degradation lock holds on this surface too — including after
 * destructuring, which is how call sites are actually written.
 *
 * The check is tuple-wrapped, as SPEC.md §9.5 rule 2 requires of every
 * never-check in this repo; `test/types/harness.test.ts` scans `src/runtime/**`
 * for the bare form.
 *
 * ## Why the envelope is not surfaced
 *
 * `error` is the **flat variant**, because the wrapper has already run the
 * reader (SPEC.md §3.7) internally. The `NuxtError` envelope carries nothing a
 * caller needs: the status is on the variant, and both `message` and
 * `statusMessage` are the tag (SPEC.md §5.1).
 *
 * ## Why `Flatten` is written *here* rather than at the call site
 *
 * SPEC.md §8.3(a)'s mandate reproduces on this surface: the union arrives out
 * of the generated map as `Simplify<Serialize<…>>`, and forwarded unflattened
 * the printer renders the wrapper's `SerializeObject` residue rather than the
 * variants. Measured against the real playground map, on the hover a caller
 * lands on first (`const r = await $typedFetch.safe('/api/users/42')`):
 *
 * | spelling | rendered |
 * | --- | --- |
 * | `Flatten<D>` in this body — shipped | **273**, flat |
 * | `D`, no `Flatten` anywhere | **432**, `SerializeObject` residue |
 * | SPEC.md §3.5's own `TypedResult<…, Flatten<…>>` argument | 333, flat |
 *
 * Row 3 is SPEC-AMENDMENTS item 32 again, from a third position: `Flatten`
 * written where the printer can still see its own alias costs a name. It costs
 * an extra one here, because `D`'s constraint then has to be met by the
 * argument — `Flatten<…> & AnyVariant`, since a mapped type over a constrained
 * parameter is no longer known to satisfy it. Writing it in the body keeps the
 * constraint SPEC.md §3.5 asks for *and* the flat render, and it makes a
 * hand-written `TypedResult<T, DeclaredErrorsOf<'/api/x'>>` legible with no
 * ceremony at the call site. Budgeted in `test/generated-map.test.ts`.
 */
export type TypedResult<T, D extends AnyVariant> = [D] extends [never]
  ? { ok: true; data: T }
  : { ok: true; data: T } | { ok: false; error: Flatten<D> }

/**
 * One `.safe` call's result, with the method computed **once** and both halves
 * of the answer derived from it.
 *
 * ## Why the method is a defaulted type parameter of this alias
 *
 * SPEC.md §10.3's Option 1: `M`'s default is Nitro's own expression from
 * `Base$Fetch`, verbatim, so the success type and the error type share one
 * traversal of `MatchedRoutes`' scoring conditional rather than taking one
 * each.
 *
 * ## Why it is a defaulted parameter of an *alias* and not of the call signature
 *
 * **Measured, and it is SPEC-AMENDMENTS item 33's trap under a new name.**
 * Written as a fourth type parameter of {@link TypedFetchSafe} with the
 * constraint the two use sites need — `M extends RouterMethod = …` — the
 * checker verifies the default against that constraint **eagerly, at the
 * declaration**, with `R` and `O` still unresolved. That walks
 * `NitroFetchOptions<R>`'s `Uppercase<AvailableRouterMethod<R>>` into
 * `MatchedRoutes` and gives one `TS2321 Excessive stack depth` per
 * `InternalApi` key — in `src/runtime/types.ts` itself, in any program whose
 * route interface is populated, and it takes the whole signature down with it:
 * `data` collapses to `unknown` and the declared union to `never`. A type
 * alias's parameters carry no constraint here, so nothing is checked until a
 * call site instantiates it with a resolved request. `Extract<M, RouterMethod>`
 * is what then satisfies the two constraints, at that point rather than this
 * one.
 */
type SafeResultFor<
  R extends NitroFetchRequest,
  T,
  O extends NitroFetchOptions<R>,
  M = NitroFetchOptions<R> extends O ? 'get' : ExtractedRouteMethod<R, O>,
> = TypedResult<
  TypedInternalResponse<R, T, Extract<M, RouterMethod>>,
  DeclaredErrorsForCall<R, Extract<M, RouterMethod>>
>

/**
 * The throwing call signature — **a pure typings mirror of vanilla**
 * (SPEC.md §3.5).
 *
 * It is Nitro's own `Base$Fetch` under a name of ours rather than a
 * re-spelling of it, and that is the strongest available statement of
 * SPEC.md §6.1's degradation lock on this surface: the default entry point
 * cannot drift from vanilla, because it *is* vanilla, and a Nitro release that
 * changes the signature moves both at once.
 *
 * Named because SPEC.md §3.5 and §3.6 both name it: `event.$typedFetch` is this
 * plus `.safe` and nothing else, and is deliberately **not** a copy of
 * {@link $TypedFetch}.
 */
export type Base$TypedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> = Base$Fetch<DefaultT, DefaultR>

/**
 * The sibling that returns instead of throwing (SPEC.md §3.5).
 *
 * ## Why both behaviours ship
 *
 * They cannot live in one function. `declaredError(err)` **does not work in a
 * `catch`**: under `--strict` a catch variable is `unknown`, so overload
 * resolution has nothing to infer from and falls to SPEC.md §5.3's shape floor
 * — a missing-property error on every payload, and a typo'd tag comparing
 * silently as a string. TypeScript does not type exceptions, so **a return type
 * is the only position that can carry the union**. That is a language limit,
 * not an implementation gap.
 *
 * The returning form could not be the only one either: it would put a permanent
 * `.data` shape tax on every undeclared route and external URL, breaking the
 * degradation lock; a return-shape change is not a typing change; and
 * SPEC.md §3.4's documented `useAsyncData(() => $typedFetch(…))` composition
 * depends on the throwing form.
 *
 * ## `ok: false` means one thing only
 *
 * It means *"a declared failure the route promised"*. Nothing else can produce
 * it — a
 * 500, a timeout, a network drop and a route that declares nothing all leave
 * through `throw`, exactly as they do through vanilla `$fetch`. So `.safe`
 * reads as one sentence: **it returns what the route declared; everything else
 * throws, as it always did.**
 *
 * Separate from {@link $TypedFetch} because `event.$typedFetch` is
 * {@link Base$TypedFetch} plus exactly this member (SPEC.md §3.6), and one
 * declaration of a signature is better than two that can disagree.
 */
export interface TypedFetchSafe<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> {
  <
    T = DefaultT,
    R extends NitroFetchRequest = DefaultR,
    O extends NitroFetchOptions<R> = NitroFetchOptions<R>,
  >(
    request: R,
    opts?: O
  ): Promise<SafeResultFor<R, T, O>>
}

/**
 * The imperative surface (SPEC.md §3.5) — for event handlers, stores, and
 * anywhere the composable is unusable.
 *
 * ```ts
 * const user = await $typedFetch('/api/users/123')        // throws, as $fetch does
 * const r    = await $typedFetch.safe('/api/users/123')   // returns the declared union
 * ```
 *
 * ## A full mirror of vanilla's namespace, verified against the real declaration
 *
 * Nitro's `$Fetch` is a **single** call signature plus exactly `raw` and
 * `create` — there is no `native` (that member is on ofetch's own interface,
 * not on the one the global is typed as) and no overload set, so this is far
 * cheaper than SPEC.md §3.4's five-overload job. Not mirroring the two members
 * was rejected: `$typedFetch.` showing a shorter completion list than `$fetch.`
 * is a visible way to fail SPEC.md §6.1's degradation lock, and it would force
 * a call site needing both typed errors and the raw response to pick one.
 *
 * **Neither member gets its own `.safe`.** `raw`'s value is the response
 * object, which is orthogonal to the declared channel — ofetch throws on
 * `!response.ok` there too — and a created instance's `.safe` is the same
 * `.safe`. `raw` is therefore vanilla's own member, indexed out of Nitro's
 * declaration rather than restated, because a pure passthrough that is spelled
 * a second time is free to drift from what it passes through.
 *
 * **`create` returns the *typed* interface.** Returning a vanilla `$Fetch`
 * would be a silent typing cliff: the call compiles and `.safe` vanishes one
 * level later with no signal at all.
 *
 * Declared as a named `interface` with the value a `const` of that type, which
 * is SPEC.md §8.3(b) and exactly how Nitro declares its own global
 * (`declare var $fetch: $Fetch`). The hover is the interface's name.
 */
export interface $TypedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> extends Base$TypedFetch<DefaultT, DefaultR> {
  safe: TypedFetchSafe<DefaultT, DefaultR>
  raw: $Fetch<DefaultT, DefaultR>['raw']
  create: <T = DefaultT, R extends NitroFetchRequest = DefaultR>(
    defaults: FetchDefaults
  ) => $TypedFetch<T, R>
}

// ---------------------------------------------------------------------------
// The server-to-server surface (SPEC.md §3.6)
// ---------------------------------------------------------------------------

/**
 * `event.$typedFetch` — the typed surface over the **event's own** fetch
 * (SPEC.md §3.6).
 *
 * ```ts
 * export default defineTypedEventHandler(
 *   { errors: [orderErrors] },
 *   async (event, { fail }): Promise<Order> => {
 *     const r = await event.$typedFetch.safe('/api/users/1')  // cookies + headers forwarded
 *     if (!r.ok) {
 *       switch (r.error.tag) {                                // the callee's union
 *         case 'user-not-found': return fail('order-orphaned', { userId: r.error.userId })
 *         case 'user-suspended': return fail('order-blocked', {})
 *       }
 *     }
 *     return load(r.data.id)
 *   },
 * )
 * ```
 *
 * ## It is {@link Base$TypedFetch} plus `.safe`, and **not** a copy of {@link $TypedFetch}
 *
 * `raw` and `create` are absent because the thing underneath has neither.
 * Nitro types `event.$fetch` as `Base$Fetch<unknown, NitroFetchRequest>`
 * (`nitropack/dist/types/index.d.ts:230-236`) — a bare call signature — because
 * it is not an ofetch instance at all: it is a closure over h3's
 * `fetchWithEvent`. Adding either member would be the inverse of SPEC.md §6.1's
 * degradation lock: a completion list *longer* than vanilla's, offering two
 * calls that cannot be made.
 *
 * The type parameters are gone for the same reason. `event.$fetch` is declared
 * with its two arguments already fixed, so there is no instance to re-default
 * and nothing for a caller to pass.
 *
 * ## Why `.safe` is the same {@link TypedFetchSafe} the global uses
 *
 * One declaration of a signature is better than two that can disagree
 * — and the *rule* about what may reach the false arm is identical on both
 * surfaces (a declared failure and nothing else). What genuinely differs
 * between them is the header merge, which is run time and lives in
 * `./server/event-typed-fetch`; SPEC.md §3.8's title says a shared helper for
 * *that* would be a defect, and it says nothing of the kind about this.
 *
 * ## What this surface is *for*
 *
 * Context. The global `$typedFetch` already works verbatim inside a Nitro
 * handler (SPEC.md §3.5, and `server/api/typed-fetch-probe.get.ts` runs it), so
 * this member exists for exactly one thing: `fetchWithEvent` forwards the
 * incoming request's headers and cookies, the caller's platform bindings and
 * its `waitUntil`, and the global forwards none of it.
 *
 * *Forwards* is deliberately precise there. h3 hands the callee the caller's
 * whole `event.context` object, but Nitro reads exactly two things out of it —
 * `_platform`, which it merges into the callee's own context, and `waitUntil`
 * (`nitropack@2.13.4 dist/runtime/internal/app.mjs:48-59`). An arbitrary key
 * set on the caller's `event.context` does **not** appear on the callee's;
 * measured both ways against a real build in
 * `playground/server/api/context-echo.get.ts`. A callee that genuinely wants
 * the caller's context object finds it at `event.node.req.__unenv__`.
 *
 * ## Prefer `.safe` here, and what it costs not to
 *
 * Guidance rather than mechanism, and it is stronger on this surface than
 * anywhere else. An `ok: false` a caller ignores is a **compile-visible**
 * omission; an escaped throw is not — and an escaped callee failure is marked
 * `unhandled`, so Nitro's production serializer wipes its `data` and masks its
 * `message`. That is the safe direction and it is free (the envelope cannot
 * leak, and the caller's own client sees an undeclared 500). But
 * `statusMessage` is **not** gated by that check and it carries the callee's
 * tag, so the callee's internal tag reaches the caller's client as the HTTP
 * reason phrase. SPEC.md §6.5: this is byte-for-byte what a plain `$fetch`
 * between handlers already does, the module did not introduce it, and
 * normalising it would break the typings-only lock on the server surface alone.
 *
 * ## Forwarding a callee's failure is always an explicit act of publication
 *
 * No propagation mechanism ships and none is needed. A caller writes
 * `if (!r.ok) return fail(…)` and raises its **own** variant; to forward a
 * callee's variant verbatim it imports the same catalogue and declares it in
 * its own `errors: [...]`, which already works with zero new API. The rule is
 * one line:
 *
 * > A route's declared union is exactly what it wrote in `errors: [...]`. Where
 * > a variant is *produced* — in the handler body, in a helper, or forwarded
 * > from a callee — is invisible to the client and is not a design question.
 *
 * Accidental leakage is unrepresentable rather than merely discouraged:
 * {@link Fail} is scoped to the route's own union, so raising an undeclared tag
 * is `TS2345`.
 */
export interface Event$TypedFetch extends Base$TypedFetch<
  unknown,
  NitroFetchRequest
> {
  safe: TypedFetchSafe
}

declare module 'h3' {
  /**
   * The per-request member (SPEC.md §3.6), declared where Nitro declares its
   * own four.
   *
   * **This augmentation is why SPEC.md §7.2 forbids pinning `h3`.** A module
   * augmentation binds to a *resolved path*, so a second physical h3 directory
   * lands this declaration on the copy the consumer is not using — a `TS2339`
   * with no explanation, or silence. Caret ranges overlapping Nuxt's own are
   * what keep pnpm collapsing to one directory; an exact pin *causes* the
   * duplicate the moment Nuxt ships a patch that moves h3.
   *
   * Required rather than optional, mirroring Nitro's own `$fetch` — which is
   * likewise assigned per request and likewise absent from an event
   * constructed outside a Nitro app.
   */
  interface H3Event {
    $typedFetch: Event$TypedFetch
  }
}

declare global {
  /**
   * The global, declared the way Nitro declares its own — which is what makes
   * `$typedFetch` callable inside a Nitro handler, in `<script setup>` and in a
   * consumer's `shared/` directory with **no new entry point** (SPEC.md §3.5).
   *
   * The value is installed by the two plugins the module registers, over
   * `globalThis.$fetch` on whichever side is running.
   *
   * `var` rather than `const` because that is the only form that declares a
   * property on `globalThis`, and it is Nitro's own spelling
   * (`nitropack/dist/types/index.d.ts:127`).
   */
  // eslint-disable-next-line vars-on-top
  var $typedFetch: $TypedFetch
}
