// The design, as types only. Every decision here has a reason recorded in
// DESIGN.md; the reasons are not repeated in this file. `call-sites.ts` is the
// evidence that it reads well and narrows.

import type {
  AsyncDataOptions,
  AsyncDataResult,
  KeysOf,
  KnownErrorsOf,
  NuxtError,
  PickFrom,
  Ref,
  ResponseOf,
} from './fixtures'

// --- The wire --------------------------------------------------------------

/** The wire-guaranteed floor: a string `tag` and a number `status`. */
export interface KnownVariant {
  tag: string
  status: number
}

/** Nitro's production error body with the marker inside `data`. */
export interface KnownErrorBody<E extends KnownVariant> {
  error: true
  url: string
  statusCode: number
  statusMessage: string
  message: string
  data: { __knownError__: E }
}

/** What the matcher accepts: the marker may or may not be there. */
export interface KnownErrorCarrier<E extends KnownVariant> {
  data?: KnownErrorBody<E> | undefined
}

/** The ref is read once, at call time — wrong inside a `watch`. See §1. */
export type MaybeRef<T> = T | Ref<T>

// --- Arms and fallback -----------------------------------------------------

/** One arm per declared tag, each receiving the whole variant. Arms handle,
 * they do not produce — `void`, not a type parameter. See §1. */
export type Arms<E extends KnownVariant> = {
  [K in E['tag']]: (variant: Extract<E, { tag: K }>) => void
}

/** `unrecognized` is a deploy-skew tag this client has never heard of. See §2. */
export type Fallback = (error: NuxtError, unrecognized?: KnownVariant) => void

// --- The matcher -----------------------------------------------------------

/** The declared union recovered from a carrier. A naked conditional, so it
 * distributes: a union of carriers (a handler touching two routes) yields the
 * union of every route's variants. See §4. */
export type VariantOf<C> = C extends KnownErrorCarrier<infer E> ? E : never

// The `void` return is load-bearing three ways — see §1 and §4.
export interface MatchError {
  // Typed: generic over the whole carrier, not the union — `E` inferred
  // directly failed on carrier unions (§4). The arms have no inference site,
  // so they cannot pin anything.
  <C extends KnownErrorCarrier<KnownVariant>>(
    error: MaybeRef<C | null | undefined>,
    arms: Arms<VariantOf<C>>,
    fallback: Fallback
  ): void

  // Degraded: a vanilla `useFetch`, an undeclared route, an `unknown` in a
  // `catch`. `Record<string, never>` admits `{}` and nothing else — see §4.
  (error: unknown, arms: Record<string, never>, fallback: Fallback): void
}

export declare const matchError: MatchError

// --- The composable surface ------------------------------------------------

/** A route declaring nothing is typed exactly as vanilla — the degradation lock. */
export type KnownErrorRef<R extends string, E = KnownErrorsOf<R>> = [
  E,
] extends [never]
  ? NuxtError<unknown>
  : NuxtError<KnownErrorBody<Extract<E, KnownVariant>>>

/** Vanilla, stubbed to the two members the sandbox reads. */
export declare function useFetch<R extends string>(
  url: R
): Promise<{
  data: Ref<ResponseOf<R> | undefined>
  error: Ref<NuxtError | undefined>
}>

/** The typed mirror: same shape, `error` carries the route's union. */
export declare function useCheckedFetch<R extends string>(
  url: R
): Promise<{
  data: Ref<ResponseOf<R> | undefined>
  error: Ref<KnownErrorRef<R> | undefined>
}>

/** The lazy twin, mirroring vanilla's `useLazyFetch`: same surface, `lazy`
 * pre-set. The reactive matcher composition is what reads its late error. */
export declare const useLazyCheckedFetch: typeof useCheckedFetch

// --- The imperative surface ------------------------------------------------

/** A discriminated union, so `if (error) return` narrows `data` to `T`. See §1. */
export type TryResult<R extends string> =
  | { data: ResponseOf<R>; error: undefined }
  | { data: undefined; error: KnownErrorRef<R> }

/** ofetch's `FetchResponse`, reduced to the two fields the argument needs. */
export interface RawResponse<R extends string> {
  status: number
  _data?: ResponseOf<R>
}

/** The seam: the call and `.try`, nothing else. Every instance satisfies it,
 * and a `shared/` util that lets its caller choose the request context accepts
 * this and not a concrete instance. See §1. */
export interface CheckedFetch {
  /** Vanilla, under our name. Throws, and the `catch` gets `unknown`. */
  <R extends string>(url: R): Promise<ResponseOf<R>>

  /** Returns instead of throwing — the only position the union can live in. */
  try: <R extends string>(url: R) => Promise<TryResult<R>>
}

/** The app-global: the seam plus ofetch's own extras. */
export interface $CheckedFetch extends CheckedFetch {
  /** No `.try`: it already returns `status` and `_data` without throwing. */
  raw: <R extends string>(url: R) => Promise<RawResponse<R>>

  /** Bare `fetch`, untouched pass-through — a `Response` has no error channel
   * to type, and dropping a vanilla member would break the mirror. */
  native: (request: string, init?: RequestInit) => Promise<Response>

  /** Must return the typed interface, or `.try` vanishes one level down. */
  create: (defaults: Record<string, unknown>) => $CheckedFetch
}

export declare const $checkedFetch: $CheckedFetch

/** The request-bound instance for SSR-safe imperative calls in app code —
 * vanilla's `useRequestFetch()`, mirrored. The seam is its honest type: on the
 * server vanilla hands back the bare `event.$fetch` closure (§3). */
export declare function useRequestCheckedFetch(): CheckedFetch

// --- The asyncData surface ---------------------------------------------------

/** What a handler must return: any try-shape. `TryResult<R>` satisfies it, and
 * so does a hand-built `{ data, error: undefined }` success. A bare typed
 * fetch resolves to plain data and fails the constraint — forgetting `.try`
 * is a compile error, not a silent degradation. */
export interface TrySource {
  data: unknown
  error: NuxtError | undefined
}

/** The success half of the handler's union — what vanilla calls `ResT`. */
export type SuccessOf<T extends TrySource> = Extract<
  T,
  { error: undefined }
>['data']

/** The failure half — every carrier the handler can produce. */
export type FailureOf<T extends TrySource> = NonNullable<T['error']>

/**
 * Vanilla `useAsyncData` with the handler returning `.try` results instead of
 * throwing: the union rides the handler's return type, the one typed channel
 * into the generics — no route is ever restated. The options are vanilla's
 * own, over the UNWRAPPED success (`transform` and `pick` see plain data).
 * See §1; the runtime is unwrap-or-rethrow, measured in §3.
 */
export interface UseCheckedAsyncData {
  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    key: string,
    handler: (ctx: { signal: AbortSignal }) => Promise<T>,
    opts?: AsyncDataOptions<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): Promise<
    AsyncDataResult<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T>>
  >

  // Keyless, exactly as vanilla: the module registers the name in
  // `optimization.keyedComposables`, so the compiler injects the key. See §3.
  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    handler: (ctx: { signal: AbortSignal }) => Promise<T>,
    opts?: AsyncDataOptions<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): Promise<
    AsyncDataResult<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T>>
  >
}

export declare const useCheckedAsyncData: UseCheckedAsyncData

/** The lazy twin, mirroring vanilla's: the same surface with `lazy` pre-set. */
export declare const useLazyCheckedAsyncData: UseCheckedAsyncData

// --- The server surface ------------------------------------------------------

// `event.$checkedFetch` is the seam *exactly* — no `.raw`, no `.create`, because
// Nitro assigns `event.$fetch` as a bare closure while typing it as the full
// interface, and mirroring the type would inherit the lie (§3). Declared by
// module augmentation, the same move the real package makes against 'h3';
// proven there by Nitro's own `$fetch` and the old package's `$typedFetch`.
// (A relative specifier is legal here — measured on TS 5.9.3.)
declare module './fixtures' {
  interface H3Event {
    $checkedFetch: CheckedFetch
  }
}
