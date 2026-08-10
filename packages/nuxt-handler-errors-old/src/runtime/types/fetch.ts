/**
 * The typed `$fetch` surfaces: the global's namespace, and the reduced one
 * `event.$typedFetch` carries.
 *
 * `DeclaredErrorsOf` comes back from `./index`, which re-exports this file —
 * a deliberate, type-only cycle. The lookup cannot move here: it reads
 * `TypedApiErrors`, which must be *declared* in the module the published
 * specifier resolves to or the emitter's augmentation shadows it instead of
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
import type { AnyVariant } from './catalogue'
import type { DeclaredErrorsOf } from './index'
import type { Flatten } from './utils'

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
 * read out of. A twin lives in `app/composables/use-typed-fetch.ts`,
 * deliberately unshared — exporting it from here would make it public API for
 * good.
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
