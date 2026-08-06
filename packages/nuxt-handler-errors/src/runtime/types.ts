/**
 * The `@dphonys/nuxt-handler-errors/types` entry point: the emitter's
 * augmentation target and the whole public type surface. A real module — a
 * non-exported ambient `unique symbol` does not survive declaration emit —
 * and every name here is public API for good, because an emitted catalogue
 * `.d.ts` carries them unevaluated into every consumer.
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
 * The slot `payload<T>()` parks its type argument in. A real `Symbol()`
 * because declaration emit drops a non-exported ambient `unique symbol`,
 * silently unbranding every catalogue a consumer imports.
 */
export const PAYLOAD: unique symbol = Symbol('nuxt-handler-errors:payload')

/** The slot a catalogue parks its variant union in. Same reasoning as `PAYLOAD`. */
export const ERRORS: unique symbol = Symbol('nuxt-handler-errors:errors')

/** A variant's payload type, marked. The runtime value is inert. */
export interface Payload<P> {
  readonly [PAYLOAD]?: P
}

// ---------------------------------------------------------------------------
// Declaring a variant
// ---------------------------------------------------------------------------

/**
 * The common 4xx/5xx literals unioned with `(number & {})`, so `status` gets
 * completions without closing the set. Deliberately no default: a defaulted
 * 400 makes a variant's status invisible where it is declared.
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
 * The wire-guaranteed floor every variant meets: a string `tag` and a number
 * `status`. Payload keys are unconstrained.
 */
export interface AnyVariant {
  tag: string
  status: number
}

/**
 * A catalogue definition, flattened into the discriminated union it declares.
 * `const` on `defineErrors`' type parameter keeps `status: 404` a `404`.
 */
export type VariantsOf<D extends Record<string, VariantDef>> = {
  [K in keyof D & string]: { tag: K; status: D[K]['status'] } & (D[K] extends {
    payload: Payload<infer P>
  }
    ? P
    : // `{}` is the identity element for `&`.
      // eslint-disable-next-line ts/no-empty-object-type
      {})
}[keyof D & string]

/** One variant's payload fields — the variant minus the two reserved names. */
export type PayloadOf<E extends AnyVariant, T extends E['tag']> = Omit<
  Extract<E, { tag: T }>,
  'tag' | 'status'
>

/**
 * Variadic: a payload-less variant takes **no** second argument, and passing
 * one is an error rather than an ignored extra. Tuple-wrapped never-check, as
 * the type harness requires.
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
 * Whether one field type survives Nitro's `Serialize` — the authority, so
 * this cannot drift from what the generated map will say. `any` survives;
 * `unknown` and `void` map to `never` silently, so they are named; and
 * `undefined` is excluded first because an optional field is `T | undefined`
 * — without that, `amount?: bigint` walks straight through.
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
 * The top-level payload fields that do not survive `Serialize`. Top-level is
 * a deliberate floor: recursing needs a self-referential index signature,
 * which rejects every named `interface` — the very shape mandated for
 * array-valued payload fields.
 */
export type UnserializablePayloadFields<T> = {
  [K in keyof T]-?: SurvivesSerialization<T[K]> extends true ? never : K
}[keyof T]

/**
 * `payload<T>()`'s constraint: every field must survive JSON serialization —
 * a `bigint` makes `JSON.stringify` throw inside Nitro, turning a declared
 * 403 into an unhandled 500. The clean branch is `unknown`, not `T` (a
 * constraint resolving to its own parameter reports as circular); the failing
 * branch is a missing property whose template-literal type names the field.
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
 * A named, reusable set of variants — the product of `defineErrors`, and a
 * real runtime value.
 */
export interface ErrorCatalogue<E extends AnyVariant> {
  readonly [ERRORS]?: E

  /**
   * Narrow the catalogue to the subset this route can actually produce.
   */
  pick: <const K extends readonly E['tag'][]>(
    ...tags: K
  ) => ErrorCatalogue<Extract<E, { tag: K[number] }>>
}

/** The element type of a composition array. */
export type AnyCatalogue = ErrorCatalogue<any>

/** The union declared by a composition array of catalogues. */
export type UnionOfCatalogues<C extends readonly AnyCatalogue[]> = {
  [I in keyof C]: C[I] extends ErrorCatalogue<infer E> ? E : never
}[number]

type IsUnion<T, U = T> = T extends any
  ? [U] extends [T]
    ? false
    : true
  : never

/**
 * The tags declared more than once across composed catalogues. One
 * distributive pass, no tuple recursion — the deferred-generic position is
 * where the compiler gives up. Identical members collapse to one and pass;
 * only a genuine divergence in status or payload trips it.
 */
export type DuplicateTags<E extends AnyVariant> = {
  [K in E['tag']]: IsUnion<Extract<E, { tag: K }>> extends true ? K : never
}[E['tag']]

/**
 * Surfaces a duplicate tag as a missing property whose template-literal type
 * names it verbatim. **Must be intersected FIRST** — `ConflictGuard<C> &
 * { errors: C }`, never the reverse: TypeScript truncates the *tail* of a
 * rendered type, and guard-last buries the message. Measured, and under test.
 */
export type ConflictGuard<C extends readonly AnyCatalogue[]> = [
  DuplicateTags<UnionOfCatalogues<C>>,
] extends [never]
  ? // `{}` is the identity element for `&`.
    // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __duplicateErrorTag__: `Duplicate error tag across composed catalogues: ${DuplicateTags<UnionOfCatalogues<C>> & string}`
    }

// ---------------------------------------------------------------------------
// The brand
// ---------------------------------------------------------------------------

/**
 * A route's declared union, riding as an **optional phantom property** on an
 * interface extending h3's `EventHandler` (h3's own marker-property idiom).
 * `ReturnType` reads only the call signature, so the brand and the response
 * payload occupy disjoint positions and vanilla `useFetch` stays clean
 * structurally. Optional, so any plain `EventHandler` still inhabits this.
 */
export interface TypedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Errors = never,
> extends EventHandler<Request, Response> {
  __declaredErrors__?: Errors
}

/**
 * Recover a route's declared union from its handler type. `Exclude<…,
 * undefined>` guards the hand-written-brand case; an unbranded handler yields
 * `never` (deliberately not `unknown`); and the `IsAny` guard is required —
 * without it an untyped route matches with `E = unknown`, silently destroying
 * narrowing everywhere. No unguarded `ExtractErrors` exists beside it.
 */
export type ExtractErrorsSafe<T> =
  IsAny<T> extends true
    ? never
    : T extends { __declaredErrors__?: infer E }
      ? Exclude<E, undefined>
      : never

/**
 * Scoped to exactly the declared union. It throws at runtime; because it
 * returns `never`, `return fail(…)` contributes nothing to the handler's
 * inferred return type.
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
 * Every callable is a named `interface` with the value a `const` of that
 * type, because a named interface renders as its own name in hovers (measured
 * 55 chars against 1075 as a bare `function` declaration).
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
 * The server declaration surface: options object first, handler last, so the
 * declaration sits visibly at the top of the route file. `Response` has no
 * default type parameter — that makes an explicit type argument a `TS2558`
 * arity error instead of a silent collapse of the success type to `any`.
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
 * A distributive identity mapped type that forces evaluation: it collapses a
 * variant's `{ tag; status } & P` intersection into the single object type a
 * hover renders. `T extends unknown` is the distributivity trigger, so a
 * union stays a union of flat members.
 */
export type Flatten<T> = T extends unknown ? { [K in keyof T]: T[K] } : never

// ---------------------------------------------------------------------------
// The generated map, and the wire
// ---------------------------------------------------------------------------

/**
 * The generated route → declared-errors map, keyed exactly like Nitro's
 * `InternalApi`. The build-time emitter reopens this interface with
 * `declare module`; empty means no handler has declared anything yet.
 */
export interface TypedApiErrors {}

/**
 * **The lookup**: a route's declared union from its path alone —
 * `DeclaredErrorsOf<'/api/users/:id'>`. `MatchedRoutes` is Nitro's own
 * scoring, so a key Nitro's interface lacks is unreachable by construction.
 *
 * The method fallback is **presence-based, diverging from Nitro on purpose**:
 * Nitro falls back to `default` on `never`, but here `never` is a legitimate
 * value (an unbranded handler), so Nitro's rule would hand a `POST` caller
 * the `default` handler's errors. Presence mirrors the h3 dispatcher;
 * asserted in `playground/server/api/method-fallback.ts`.
 *
 * `never` means "declares no failures", and `R` stays unconstrained beyond
 * `string` — rejecting external URLs would break the degradation lock.
 * Wrappers need an explicit `[Declared] extends [never]` collapse, because
 * `never` does not propagate outward through a wrapper type.
 */
export type DeclaredErrorsOf<
  R extends string,
  // Both cases admitted (the pair vanilla admits), normalised by the
  // `Lowercase<M>` below. Satisfiable from deferred positions via Nitro's own
  // `ExtractedRouteMethod`; a raw `O['method']` is not.
  M extends RouterMethod | Uppercase<RouterMethod> = 'get',
> =
  MatchedRoutes<R> extends infer Key
    ? // Distributes over multiple matched keys, and doubles as the totality
      // guard: a route this map lacks answers `never` rather than `TS2536`.
      Key extends keyof TypedApiErrors
      ? Lowercase<M> extends keyof TypedApiErrors[Key]
        ? TypedApiErrors[Key][Lowercase<M>]
        : 'default' extends keyof TypedApiErrors[Key]
          ? TypedApiErrors[Key]['default']
          : never
      : never
    : never

/**
 * The reserved key's type, derived from the exported constant so the literal
 * is written once. A `typeof import(…)` in a type position emits no runtime
 * import.
 */
export type DeclaredErrorKey = (typeof import('./shared'))['DECLARED_ERROR_KEY']

/**
 * Nitro's production error body with the marker inside `data` — the only
 * extension point across both hops. ofetch's `FetchError.data` is the whole
 * response body, so the variant sits at `err.data.data.__declaredError__`.
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
 * The error value the reader's first overload matches:
 * `NuxtError<DeclaredErrorBody<E>>` reduced to the one property walked.
 * Structural because `NuxtError` lives behind `#app`, which the server and
 * `shared/` contexts lack — and it keeps the degraded overload reachable: an
 * undeclared route's `data?: unknown` is not assignable here for any `E`, so
 * it falls to the second overload instead of matching with `E` widened.
 */
export interface DeclaredErrorCarrier<E extends AnyVariant> {
  data?: DeclaredErrorBody<E> | undefined
}

/**
 * The value form of the reader — the only read path; no call site ever writes
 * the wire key. A typed error gives the union back; anything else degrades to
 * the wire's shape floor. `undefined` means "not a declared failure",
 * covering no marker, a malformed marker and a production-stripped response
 * alike. The union stays closed (widening was measured to cost all
 * narrowing), so under deploy skew an unknown tag types as a member it is not.
 */
export interface DeclaredErrorReader {
  <E extends AnyVariant>(
    error: DeclaredErrorCarrier<E> | null | undefined
  ): E | undefined
  (error: unknown): AnyVariant | undefined
}

/**
 * The reactive sibling: the same answer, as a computed. Narrowing must land
 * on a local `const` (`const current = failure.value`) — a `.value` read does
 * not carry a narrowing across, and template narrowing is weaker still.
 *
 * The parameter is Vue's own `Ref`, not a read-only view: property
 * assignability is covariant regardless of writability, so `Ref`,
 * `ComputedRef`, `ShallowRef` and `Readonly<Ref>` all match this as-is.
 */
export interface UseDeclaredError {
  <E extends AnyVariant>(
    error: Ref<DeclaredErrorCarrier<E> | null | undefined>
  ): ComputedRef<E | undefined>
  (error: Ref<unknown>): ComputedRef<AnyVariant | undefined>
}

// ---------------------------------------------------------------------------
// The imperative fetch surface
// ---------------------------------------------------------------------------

/**
 * ofetch's `FetchOptions`, indexed out of Nitro's own `create` signature
 * rather than imported from a new dependency — exact by construction.
 */
type FetchDefaults = Parameters<$Fetch['create']>[0]

/**
 * The declared union for one call. The `R extends string` guard matters:
 * `NitroFetchRequest` also admits a `Request` object no route path can be
 * read out of. A twin lives in `app/use-typed-fetch.ts`, deliberately
 * unshared — exporting it from here would make it public API for good.
 */
type DeclaredErrorsForCall<R, M extends RouterMethod> = R extends string
  ? DeclaredErrorsOf<R, M>
  : never

/**
 * What `$typedFetch.safe` resolves to; `error` is the flat variant. The
 * `[D] extends [never]` collapse is mandatory — a union member whose
 * *property* is `never` is not itself `never`, so without it an undeclared
 * route keeps an unreachable `ok: false` arm and `ok` never narrows to
 * `true`. `Flatten` belongs here in the body; at the call site the printer
 * would render the map's `SerializeObject` residue instead of flat variants.
 */
export type TypedResult<T, D extends AnyVariant> = [D] extends [never]
  ? { ok: true; data: T }
  : { ok: true; data: T } | { ok: false; error: Flatten<D> }

/**
 * One `.safe` call's result, with the method computed **once** (Nitro's own
 * default expression) and both halves derived from it. A defaulted parameter
 * of an *alias*, never of the call signature: a constrained signature
 * parameter is checked eagerly with `R`/`O` unresolved — measured to emit one
 * `TS2321 Excessive stack depth` per `InternalApi` key and take the whole
 * signature down. `Extract<M, RouterMethod>` satisfies the use sites instead.
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
 * The throwing call signature — Nitro's own `Base$Fetch` under a name of
 * ours, so the default entry point cannot drift from vanilla because it *is*
 * vanilla. `event.$typedFetch` is this plus `.safe` and nothing else.
 */
export type Base$TypedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> = Base$Fetch<DefaultT, DefaultR>

/**
 * The sibling that returns instead of throwing — a return type is the only
 * position that can carry the union (a `catch` variable is `unknown`), and
 * the throwing form is what `useAsyncData` composes with. `ok: false` means
 * one thing only: a declared failure the route promised; everything else
 * leaves through `throw`, exactly as through vanilla.
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
 * The imperative surface: `$typedFetch(…)` throws as `$fetch` does,
 * `$typedFetch.safe(…)` returns the declared union. A full mirror of
 * vanilla's namespace — a shorter completion list than `$fetch.`'s is a
 * visible degradation-lock failure. `raw` is indexed out of Nitro's
 * declaration (a restated passthrough drifts); `create` returns the *typed*
 * interface, or `.safe` would silently vanish one level later.
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
// The server-to-server surface
// ---------------------------------------------------------------------------

/**
 * `event.$typedFetch` — the typed surface over the **event's own** fetch,
 * which forwards the incoming request's headers and cookies, `_platform` and
 * `waitUntil` (an arbitrary `event.context` key does not travel; measured in
 * `playground/server/api/context-echo.get.ts`).
 *
 * {@link Base$TypedFetch} plus `.safe`, **not** a copy of {@link $TypedFetch}:
 * `event.$fetch` is a bare call signature, so `raw`/`create` here would offer
 * calls that cannot be made. `.safe` is the same {@link TypedFetchSafe} the
 * global uses; only the run-time header merge differs. Prefer `.safe` here —
 * an escaped callee throw reaches the caller's client with the callee's tag
 * in `statusMessage`.
 */
export interface Event$TypedFetch extends Base$TypedFetch<
  unknown,
  NitroFetchRequest
> {
  safe: TypedFetchSafe
}

declare module 'h3' {
  /**
   * The per-request member, declared where Nitro declares its own four. This
   * augmentation is why pinning `h3` is forbidden: an augmentation binds to a
   * *resolved path*, so a second physical h3 directory lands it on the copy
   * the consumer is not using. Required rather than optional, mirroring
   * Nitro's own per-request `$fetch`.
   */
  interface H3Event {
    $typedFetch: Event$TypedFetch
  }
}

declare global {
  /**
   * The global, declared the way Nitro declares its own — callable in a Nitro
   * handler, `<script setup>` and a consumer's `shared/` directory with no
   * import. `var` because that is the only form that declares a property on
   * `globalThis`, and it is Nitro's own spelling.
   */
  // eslint-disable-next-line vars-on-top
  var $typedFetch: $TypedFetch
}
