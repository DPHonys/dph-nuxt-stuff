import * as v from 'valibot'
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

/**
 * One positional argument as vanilla's runtime reads it: a key, the handler,
 * the options, or the compiler-injected auto-key (a string, so a key). No
 * public overload declares the trailing auto-key, so the list is variadic.
 */
export type VanillaAsyncDataArg = Parameters<typeof useAsyncData>[number]

/** What vanilla hands back; the module layer that binds it owns the typed face. */
export type VanillaAsyncDataResult = ReturnType<typeof useAsyncData>

// A string key, or a ref key - what vanilla's `_isAutoKeyNeeded` reads as
// "the first argument is a key".
const keySchema = v.union([v.string(), v.looseObject({})])

const functionSchema = v.function()

// Decided by vanilla's own `_isAutoKeyNeeded` rule rather than "is argument 0
// a function": a getter key is a function too, and the compiler appends the
// injected auto-key LAST.
function handlerIndex(args: readonly VanillaAsyncDataArg[]): 0 | 1 {
  const [first, second] = args

  if (v.is(keySchema, first)) return 1
  if (v.is(functionSchema, first) && v.is(functionSchema, second)) return 1

  return 0
}

// The argument at the handler index, if it is callable at all: vanilla's
// own rule put it there, so a function at that position is the handler.
function isHandler(
  arg: VanillaAsyncDataArg
): arg is AsyncDataHandler<TrySource> {
  return v.is(functionSchema, arg)
}

export type RawUseAsyncData = (
  ...args: readonly VanillaAsyncDataArg[]
) => VanillaAsyncDataResult

// The returned shape is vanilla's runtime signature: the module layer that
// binds it owns the typed face, and applies it with one cast.
export function wrapVanillaAsyncData(
  vanilla: typeof useAsyncData
): RawUseAsyncData {
  // SAFETY: vanilla reads its arguments positionally and accepts the
  // compiler-injected trailing auto-key that none of its public overloads
  // declares; the variadic signature is the one its runtime implements.
  const delegate = vanilla as RawUseAsyncData

  return (...args) => {
    const at = handlerIndex(args)
    const handler = args[at]

    // Not callable: vanilla raises its own diagnostic for that.
    if (handler === undefined || !isHandler(handler)) return delegate(...args)

    const forwarded = [...args]

    forwarded[at] = async (...rest: Parameters<typeof handler>) => {
      const result = await handler(...rest)

      // Rethrowing is lossless: h3's `createError` short-circuits on its own
      // errors, so the carrier lands in the error ref identical.
      if (result.error) throw result.error

      return result.data
    }

    return delegate(...forwarded)
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
// SAFETY: the overloads are vanilla's own with the handler's try-shape swapped
// for its unwrapped success; the wrapper forwards every argument and only
// substitutes the handler, so vanilla's runtime honours each of them.
export const useCheckedAsyncData = wrapVanillaAsyncData(
  useAsyncData
) as UseCheckedAsyncData

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyAsyncData` rather than
 * passing `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call
 * correctly.
 */
// SAFETY: as for `useCheckedAsyncData` - the same wrapper over the lazy twin.
export const useLazyCheckedAsyncData = wrapVanillaAsyncData(
  useLazyAsyncData
) as UseCheckedAsyncData
