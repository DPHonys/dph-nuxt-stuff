/**
 * `useCheckedAsyncData` / `useLazyCheckedAsyncData`: vanilla `useAsyncData`
 * where the handler returns `.try` results instead of throwing. No route is
 * ever restated — the declared union rides the handler's return type, which is
 * the one typed channel into vanilla's generics.
 *
 * Not on a published specifier, and that is forced — this file imports `#app`,
 * which exists in the app build only — so the auto-import registration in
 * `src/module.ts` is the whole contract for these two names; an explicit import
 * is `#imports`. The keyless overloads need that same registration to name both
 * functions in `optimization.keyedComposables`.
 */

import type { MaybeRefOrGetter } from 'vue'
import type { AsyncData, AsyncDataOptions, NuxtError } from '#app'
import { useAsyncData, useLazyAsyncData } from '#app'
import type {
  AsyncDataHandler,
  AsyncDataOptionsWithTransform,
  KeysOf,
  PickFrom,
} from '#app/composables/asyncData'

// ---------------------------------------------------------------------------
// The handler's constraint, and the two halves read off it
// ---------------------------------------------------------------------------

/**
 * What a handler must return: any try-shape. `TryResult<T, E>` satisfies it, and
 * so does a hand-built `{ data, error: undefined }` success — the shape a
 * multi-route repository method returns after early-returning each failure.
 *
 * A bare `$checkedFetch` call resolves to plain data and fails the constraint:
 * forgetting `.try` is a compile error, not a silent degradation.
 */
export interface TrySource {
  data: unknown
  error: NuxtError | undefined
}

/** The success half of the handler's union — what vanilla calls `ResT`. */
export type SuccessOf<T extends TrySource> = Extract<
  T,
  { error: undefined }
>['data']

/**
 * The failure half — every carrier the handler can produce, as a union, which
 * is exactly what {@link import('../../types/matcher').MatchError}'s
 * carrier-generic overload needs for cross-route exhaustiveness.
 */
export type FailureOf<T extends TrySource> = NonNullable<T['error']>

// ---------------------------------------------------------------------------
// The declaration
// ---------------------------------------------------------------------------

/**
 * A full eight-overload mirror of vanilla `useAsyncData` — the keyless four and
 * the keyed four, `AsyncDataOptionsWithTransform` first in each group, exactly
 * as vanilla orders them. `ResT` becomes {@link SuccessOf} and vanilla's
 * `NuxtErrorDataT` slot is **deleted**, the error being computed from the
 * handler instead; everything else is vanilla's, including the option types
 * (`transform` and `pick` therefore see the unwrapped success, never a
 * try-shape). Vanilla's factory slots collapse to their non-factory defaults —
 * nothing here is built by `createUseAsyncData`.
 *
 * An interface, so the overload count never reaches the hover.
 */
export interface UseCheckedAsyncData {
  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    handler: AsyncDataHandler<T>,
    opts: AsyncDataOptionsWithTransform<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T> | undefined>

  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    handler: AsyncDataHandler<T>,
    opts: AsyncDataOptionsWithTransform<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T> | undefined>

  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    handler: AsyncDataHandler<T>,
    opts?: AsyncDataOptions<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T> | undefined>

  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    handler: AsyncDataHandler<T>,
    opts?: AsyncDataOptions<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T> | undefined>

  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    key: MaybeRefOrGetter<string>,
    handler: AsyncDataHandler<T>,
    opts: AsyncDataOptionsWithTransform<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T> | undefined>

  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    key: MaybeRefOrGetter<string>,
    handler: AsyncDataHandler<T>,
    opts: AsyncDataOptionsWithTransform<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T> | undefined>

  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    key: MaybeRefOrGetter<string>,
    handler: AsyncDataHandler<T>,
    opts?: AsyncDataOptions<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T> | undefined>

  <
    T extends TrySource,
    DataT = SuccessOf<T>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    key: MaybeRefOrGetter<string>,
    handler: AsyncDataHandler<T>,
    opts?: AsyncDataOptions<SuccessOf<T>, DataT, PickKeys, DefaultT>
  ): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, FailureOf<T> | undefined>
}

// ---------------------------------------------------------------------------
// The values
// ---------------------------------------------------------------------------

/** Vanilla's runtime signature: variadic, split by inspection. */
type VanillaUseAsyncData = (...args: unknown[]) => unknown

/**
 * Where the handler sits, decided by vanilla's own `_isAutoKeyNeeded` rule
 * (nuxt `asyncData.js:226`) rather than by "is argument 0 a function": a getter
 * key is a function too, and the compiler appends the injected auto-key *last*,
 * so neither position is decidable from its own type alone.
 */
function handlerIndex(args: readonly unknown[]): 0 | 1 {
  const [first, second] = args

  if (typeof first === 'string') return 1
  if (typeof first === 'object' && first !== null) return 1
  if (typeof first === 'function' && typeof second === 'function') return 1

  return 0
}

/**
 * Delegate to vanilla with the handler wrapped, and nothing else: `status`,
 * `refresh`, `pending`, abort, dedupe and every option are vanilla's own.
 */
function wrapVanillaAsyncData(
  vanilla: VanillaUseAsyncData
): UseCheckedAsyncData {
  return ((...args: unknown[]) => {
    const at = handlerIndex(args)
    const handler = args[at] as (...rest: unknown[]) => Promise<TrySource>

    const forwarded = [...args]

    forwarded[at] = async (...rest: unknown[]) => {
      const result = await handler(...rest)

      // Rethrowing is lossless: Nuxt assigns `error.value = createError(error)`
      // on a handler rejection and h3's `createError` short-circuits on its own
      // errors, so the carrier lands in the error ref identical — no re-wrap,
      // no change of marker depth.
      if (result.error) throw result.error

      return result.data
    }

    return vanilla(...forwarded)
  }) as UseCheckedAsyncData
}

/**
 * Vanilla's data composable with the handler's declared union on the error ref:
 * `data` is the unwrapped success, and `matchError(error, …)` is the one read
 * path.
 */
export const useCheckedAsyncData: UseCheckedAsyncData = wrapVanillaAsyncData(
  useAsyncData as unknown as VanillaUseAsyncData
)

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyAsyncData` rather than passing
 * `lazy: true` — Nuxt also tags the call for its dev-mode data diagnostics, and
 * that tag would be wrong if the option came from here.
 */
export const useLazyCheckedAsyncData: UseCheckedAsyncData =
  wrapVanillaAsyncData(useLazyAsyncData as unknown as VanillaUseAsyncData)
