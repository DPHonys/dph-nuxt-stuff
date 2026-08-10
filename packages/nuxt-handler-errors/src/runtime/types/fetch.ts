/**
 * The checked fetch surfaces: the seam every instance satisfies, the app
 * global's full namespace, and what `.try` resolves to.
 *
 * `KnownErrorsOfRoute` comes back from `./index`, which re-exports this file —
 * a deliberate, type-only cycle. The lookup cannot move here: it reads
 * `KnownApiErrors`, which must be *declared* in the module the published
 * specifier resolves to, or the emitter's augmentation shadows it instead of
 * merging.
 */

import type { RouterMethod } from 'h3'
import type {
  $Fetch,
  Base$Fetch,
  ExtractedRouteMethod,
  NitroFetchOptions,
  NitroFetchRequest,
  TypedInternalResponse,
} from 'nitropack/types'
import type { NuxtError } from 'nuxt/app'
import type { KnownErrorBody } from '../shared/wire'
import type { KnownErrorsOfRoute } from './index'
import type { KnownVariant } from './known-error'

// ---------------------------------------------------------------------------
// The error one call can produce
// ---------------------------------------------------------------------------

/**
 * ofetch's `FetchOptions`, indexed out of Nitro's own `create` signature rather
 * than imported from a package we do not depend on — exact by construction.
 */
type FetchDefaults = Parameters<$Fetch['create']>[0]

/**
 * The declared union for one call. The `R extends string` guard matters:
 * `NitroFetchRequest` also admits a `Request` object no route path can be read
 * out of. A twin lives in `app/composables/use-checked-fetch.ts`, deliberately
 * unshared — exporting it from here would make it public API for good, and the
 * composable's method slot is spelled differently.
 */
type KnownErrorsForCall<R, M extends RouterMethod> = R extends string
  ? KnownErrorsOfRoute<R, M>
  : never

/**
 * The carrier `.try` hands back: the framework's error object with the route's
 * union under `data`, because both producers of it — ofetch's `FetchError` run
 * through `createError`, and the composable's error ref — carry the envelope
 * and not a flat variant.
 *
 * The undeclared collapse is mandatory: `NuxtError<never>` is *narrower* than
 * vanilla's `NuxtError<unknown>`, and `never` does not propagate outward
 * through a wrapper type. `Declared` is a defaulted parameter so the lookup is
 * instantiated once per call.
 */
export type KnownErrorFor<
  R,
  M extends RouterMethod,
  Declared = KnownErrorsForCall<R, M>,
> = [Declared] extends [never]
  ? NuxtError<unknown>
  : NuxtError<KnownErrorBody<Extract<Declared, KnownVariant>>>

// ---------------------------------------------------------------------------
// `.try`
// ---------------------------------------------------------------------------

/**
 * A discriminated union, so `if (error) return` narrows `data` with no second
 * guard and no `!`. Both arms are always present: unlike a declared-only
 * channel, `.try` reports *every* failure, so a route that declares nothing
 * still has a failure arm — carrying vanilla's own `NuxtError`.
 *
 * The success arm is Nitro's own response type, indexed out of `Base$Fetch`'s
 * return position — plain `T`, no `null`, no `| undefined`. There is no `ok`:
 * `error`'s presence is the discriminant.
 */
export type TryResult<T, E> =
  | { data: T; error: undefined }
  | { data: undefined; error: E }

/**
 * One `.try` call's result, with the method computed **once** (Nitro's own
 * default expression) and both halves derived from it. A defaulted parameter of
 * an *alias*, never of the call signature: a constrained signature parameter is
 * checked eagerly with `R`/`O` unresolved — measured to emit one `TS2321
 * Excessive stack depth` per `InternalApi` key and take the whole signature
 * down. `Extract<M, RouterMethod>` satisfies the use sites instead.
 */
type TryResultFor<
  R extends NitroFetchRequest,
  T,
  O extends NitroFetchOptions<R>,
  M = NitroFetchOptions<R> extends O ? 'get' : ExtractedRouteMethod<R, O>,
> = TryResult<
  TypedInternalResponse<R, T, Extract<M, RouterMethod>>,
  KnownErrorFor<R, Extract<M, RouterMethod>>
>

/**
 * The sibling that returns instead of throwing — a return type is the only
 * position that can carry the declared union, because a `catch` variable is
 * `unknown`. Its generics are `Base$Fetch`'s, so the request and options are
 * typed exactly as the throwing form types them.
 */
export interface CheckedFetchTry<
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
  ): Promise<TryResultFor<R, T, O>>
}

// ---------------------------------------------------------------------------
// The seam, and the global over it
// ---------------------------------------------------------------------------

/**
 * The seam: the call and `.try`, nothing else. Every instance satisfies it —
 * the app global, a created instance, and the event-bound one, which is the
 * seam *exactly*. A `shared/` util that lets its caller choose the request
 * context names this as a parameter rather than a concrete instance.
 *
 * The call signature is Nitro's own `Base$Fetch` under a name of ours, so the
 * default entry point cannot drift from vanilla because it *is* vanilla.
 */
export interface CheckedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> extends Base$Fetch<DefaultT, DefaultR> {
  try: CheckedFetchTry<DefaultT, DefaultR>
}

/**
 * The app global: the seam plus ofetch's own extras. A full mirror of vanilla's
 * namespace — a shorter completion list than `$fetch.`'s is a visible
 * degradation-lock failure.
 */
export interface $CheckedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> extends CheckedFetch<DefaultT, DefaultR> {
  /**
   * Indexed out of Nitro's declaration; a restated passthrough drifts. **No
   * `.try`**: it already returns a `FetchResponse` without throwing.
   */
  raw: $Fetch<DefaultT, DefaultR>['raw']

  /**
   * ofetch's bare `fetch`, passed through untouched — a `Response` has no error
   * channel to type, and dropping a vanilla member would break the mirror.
   * Spelled as the global `fetch` because that is exactly what ofetch's own
   * `native` is; Nitro's `$Fetch` does not declare the member at all.
   */
  native: typeof globalThis.fetch

  /** Must return the *checked* interface, or `.try` vanishes one level down. */
  create: <T = DefaultT, R extends NitroFetchRequest = DefaultR>(
    defaults: FetchDefaults
  ) => $CheckedFetch<T, R>
}
