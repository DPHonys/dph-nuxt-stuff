// Not on a published specifier — this file imports `#app`, which exists in the
// app build only. The auto-import registration in `src/module.ts` is the whole
// contract for these names; an explicit import is `#imports`.

import type { MaybeRefOrGetter } from 'vue'
import type { AsyncData, AsyncDataOptions, NuxtError } from '#app'
import { useAsyncData, useLazyAsyncData } from '#app'
import type {
  AsyncDataHandler,
  AsyncDataOptionsWithTransform,
  KeysOf,
  PickFrom,
} from '#app/composables/asyncData'

/**
 * What a handler must return: any try-shape. A bare `$checkedFetch` call
 * resolves to plain data and fails the constraint — forgetting `.try` is a
 * compile error.
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

/** The failure half — every carrier the handler can produce, as a union. */
export type FailureOf<T extends TrySource> = NonNullable<T['error']>

/**
 * Vanilla `useAsyncData`'s signature with the error computed from the
 * handler. `transform` and `pick` see the unwrapped success, never a
 * try-shape.
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

type VanillaUseAsyncData = (...args: unknown[]) => unknown

// Decided by vanilla's own `_isAutoKeyNeeded` rule rather than "is argument 0
// a function": a getter key is a function too, and the compiler appends the
// injected auto-key LAST.
function handlerIndex(args: readonly unknown[]): 0 | 1 {
  const [first, second] = args

  if (typeof first === 'string') return 1
  if (typeof first === 'object' && first !== null) return 1
  if (typeof first === 'function' && typeof second === 'function') return 1

  return 0
}

function wrapVanillaAsyncData(
  vanilla: VanillaUseAsyncData
): UseCheckedAsyncData {
  return ((...args: unknown[]) => {
    const at = handlerIndex(args)
    const handler = args[at] as (...rest: unknown[]) => Promise<TrySource>

    const forwarded = [...args]

    forwarded[at] = async (...rest: unknown[]) => {
      const result = await handler(...rest)

      // Rethrowing is lossless: h3's `createError` short-circuits on its own
      // errors, so the carrier lands in the error ref identical.
      if (result.error) throw result.error

      return result.data
    }

    return vanilla(...forwarded)
  }) as UseCheckedAsyncData
}

/**
 * Vanilla's data composable with the handler's declared union on the error
 * ref: `data` is the unwrapped success, and `matchError(error, …)` is the one
 * read path.
 */
export const useCheckedAsyncData: UseCheckedAsyncData = wrapVanillaAsyncData(
  useAsyncData as unknown as VanillaUseAsyncData
)

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyAsyncData` rather than
 * passing `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call
 * correctly.
 */
export const useLazyCheckedAsyncData: UseCheckedAsyncData =
  wrapVanillaAsyncData(useLazyAsyncData as unknown as VanillaUseAsyncData)
