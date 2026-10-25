/**
 * `useBetterAsyncData` and `useLazyBetterAsyncData`: Nuxt's own
 * `useAsyncData` and `useLazyAsyncData`, whose handler resolves to a `.try`
 * result instead of throwing.
 */

import { useAsyncData, useLazyAsyncData } from '#app'
import { failureOrigin } from '../../shared/errors/try-result'
import { isFunction, isRecordLike, isString } from '../../shared/guards'
import { toNuxtError } from '../../shared/h3'
import type {
  BetterAsyncDataHandler,
  TrySource,
  UseBetterAsyncData,
} from '../../types/composables'

/**
 * One positional argument as vanilla's runtime reads it: a key, the handler,
 * the options, or the key the compiler appends (a string, so a key). No
 * public overload declares the appended key, so the list is variadic.
 */
export type VanillaAsyncDataArg = Parameters<typeof useAsyncData>[number]

/** Vanilla's runtime signature, which the wrapper keeps. */
export type RawUseAsyncData<Result> = (
  ...args: readonly VanillaAsyncDataArg[]
) => Result

// Vanilla's own `_isAutoKeyNeeded` rule, the same on every Nuxt 4, rather
// than "is the first argument a function": a getter key is a function too,
// and the compiler appends the key last.
function handlerIndex(args: readonly VanillaAsyncDataArg[]): 0 | 1 {
  const [first, second] = args

  // A string key or a ref key. Vanilla reads any non-null object as a key,
  // an array too, which no key is: handed one, both fail alike.
  if (isString(first) || isRecordLike(first)) return 1
  if (isFunction(first) && isFunction(second)) return 1

  return 0
}

// The argument at the handler index, if it is callable at all: vanilla's
// own rule put it there, so a function at that position is the handler.
function isHandler(
  arg: VanillaAsyncDataArg | undefined
): arg is BetterAsyncDataHandler<TrySource> {
  return isFunction(arg)
}

// A failure goes back to vanilla as the `NuxtError` the fetch threw, which
// Nuxt's `createError` hands on untouched, so the `error` ref keeps the
// response body - the Known error at `data.data` - and the status. Thrown as
// the plain variant, it would become Nuxt's `500` around it. A variant the
// fetch family did not classify has no such error, and gets the one Nuxt
// would have made of it.
function rethrown(variant: TrySource['error'] & object): Error {
  return failureOrigin(variant) ?? toNuxtError(variant)
}

// A function whose source text is native code, which Nuxt hashes by its name.
const NATIVE_SOURCE = /\{\s*\[native code\]\s*\}\s*$/

/**
 * `substitute`, as Nuxt's development check on a key two calls share sees
 * `handler`. The check hashes each call's handler from its source text, read
 * with `Function.prototype.toString`, and every substitute has the same
 * source, so two different handlers under one key would never warn. A bound
 * function's source is native code, which Nuxt hashes by name instead (4.0
 * through ohash's `name()`, 4.6 as `name(length)`), so the substitute goes
 * over bound and named for the handler's own source: what Nuxt would have
 * hashed, or the handler's name when it is native code itself.
 */
function carryingHandlerSource(
  substitute: BetterAsyncDataHandler<TrySource['data']>,
  handler: BetterAsyncDataHandler<TrySource>
): BetterAsyncDataHandler<TrySource['data']> {
  const source = Function.prototype.toString.call(handler)
  // Bound to nothing: the substitute is an arrow, which ignores `this`.
  const bound = substitute.bind(undefined)

  Object.defineProperty(bound, 'name', {
    value: NATIVE_SOURCE.test(source) ? handler.name : source,
  })

  return bound
}

/**
 * The wrapper over vanilla's variadic runtime signature, generic in what the
 * delegate answers so a recording double wraps as readily as vanilla: the
 * handler, wherever vanilla's rule finds it, is replaced by one that resolves
 * a success to its data and throws a failure, and that Nuxt's development
 * check tells apart as it would the handler; every other argument, the
 * appended key included, is forwarded as it came.
 */
export function wrapRawAsyncData<Result>(
  delegate: RawUseAsyncData<Result>
): RawUseAsyncData<Result> {
  return (...args) => {
    const at = handlerIndex(args)
    const handler = args[at]

    // Not callable: vanilla raises its own error for that.
    if (!isHandler(handler)) return delegate(...args)

    const forwarded = [...args]

    forwarded[at] = carryingHandlerSource(
      async (...rest: Parameters<BetterAsyncDataHandler<TrySource>>) => {
        const result = await handler(...rest)

        if (result.error) throw rethrown(result.error)

        return result.data
      },
      handler
    )

    return delegate(...forwarded)
  }
}

/**
 * The async-data composable named `name`: over Nuxt's own
 * `useLazyAsyncData` when `lazy`, rather than `useAsyncData` with
 * `lazy: true`, so Nuxt's development diagnostics name the call as they name
 * vanilla's twin.
 */
export function betterAsyncDataComposable(
  name: string,
  lazy: boolean
): UseBetterAsyncData {
  // SAFETY: vanilla reads its arguments positionally and accepts the appended
  // key none of its public overloads declares; the variadic signature is the
  // one its runtime implements.
  const vanilla = (lazy ? useLazyAsyncData : useAsyncData) as RawUseAsyncData<
    ReturnType<typeof useAsyncData>
  >
  const composable = wrapRawAsyncData(vanilla)

  // What a stack trace and Vue's devtools show for a call.
  Object.defineProperty(composable, 'name', { value: name })

  // SAFETY: the overloads are vanilla's own with the handler's `.try` result
  // swapped for its success; the wrapper forwards every argument and only
  // substitutes the handler, which resolves that success and throws the
  // `NuxtError` the failed fetch threw, so vanilla's runtime honours each
  // overload and its `error` ref holds that error.
  return composable as UseBetterAsyncData
}

/**
 * Drop-in `useAsyncData` whose handler resolves to a `.try` result instead
 * of throwing: `data` is the unwrapped success, and the `error` ref is the
 * `NuxtError` the failed fetch threw, the handler's Known errors in its body,
 * which `matchError(error, …)` reads by `_tag`.
 *
 * ```ts
 * const { data, error } = await useBetterAsyncData('order', () =>
 *   $betterFetch.try(`/api/orders/${id}`)
 * )
 * ```
 */
export const useBetterAsyncData = betterAsyncDataComposable(
  'useBetterAsyncData',
  false
)

/** The lazy twin, over Nuxt's own `useLazyAsyncData`. */
export const useLazyBetterAsyncData = betterAsyncDataComposable(
  'useLazyBetterAsyncData',
  true
)
