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
} from 'h3'
import type { Serialize } from 'nitropack/types'

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
