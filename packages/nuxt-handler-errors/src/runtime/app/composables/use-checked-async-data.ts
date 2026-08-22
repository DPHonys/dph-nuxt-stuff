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
 * resolves to plain data and fails the constraint - forgetting `.try` is a
 * compile error.
 */
export interface TrySource {
  data: unknown
  error: NuxtError | undefined
}

/** The success half of the handler's union - what vanilla calls `ResT`. */
export type SuccessOf<T extends TrySource> = Extract<
  T,
  { error: undefined }
>['data']

/** The failure half - every carrier the handler can produce, as a union. */
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

/** The loose runtime shape; the caller applies its own signature with one cast. */
export type RawUseAsyncData = (...args: unknown[]) => unknown

/**
 * Vanilla `useAsyncData` (or its lazy twin) with the try-shape unwrapped
 * before it reaches vanilla. The returned shape is loose on purpose: the
 * module layer that binds it owns the signature, and applies it with one cast.
 */
export function wrapVanillaAsyncData(
  vanilla: typeof useAsyncData
): RawUseAsyncData {
  return (...args: unknown[]) => {
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

    // Vanilla's public overloads omit its runtime signature - none of them
    // admits the trailing injected auto-key - so delegation erases to
    // variadic.
    return (vanilla as RawUseAsyncData)(...forwarded)
  }
}

/**
 * Drop-in `useAsyncData` whose handler returns `.try` results instead of
 * throwing: the handler's declared union lands typed on the `error` ref,
 * `data` is the unwrapped success, and `matchError(error, …)` is the one
 * read path.
 *
 * ```ts
 * const { data, error } = await useCheckedAsyncData('user', () =>
 *   $checkedFetch.try(`/api/users/${id}`)
 * )
 * ```
 */
export const useCheckedAsyncData = wrapVanillaAsyncData(
  useAsyncData
) as UseCheckedAsyncData

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyAsyncData` rather than
 * passing `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call
 * correctly.
 */
export const useLazyCheckedAsyncData = wrapVanillaAsyncData(
  useLazyAsyncData
) as UseCheckedAsyncData
