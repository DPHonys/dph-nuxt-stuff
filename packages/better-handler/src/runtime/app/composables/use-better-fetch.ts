/**
 * `useBetterFetch` and `useLazyBetterFetch`: Nuxt's own `useFetch` and
 * `useLazyFetch`, with the JSON `accept` header the whole fetch family sends,
 * re-typed from the generated maps.
 */

import { computed, toValue } from 'vue'
import type { ComputedRef } from 'vue'
import { useFetch, useLazyFetch } from '#app'
import { flatHeadersAcceptingJson } from '../../shared/better-fetch'
import { isString } from '../../shared/guards'
import type { UseBetterFetch } from '../../types/composables'

/** Vanilla's options, the call's second argument when it passes any. */
type VanillaFetchOptions = Exclude<Parameters<typeof useFetch>[1], string>

/**
 * Vanilla's runtime signature, which the wrapper keeps, generic in what it
 * answers so a recording double wraps as readily as vanilla. Spelled out:
 * Nuxt 4.6's last public overload declares the key the compiler appends,
 * Nuxt 4.0's declares none, and the runtime of both reads
 * `(request, opts | key, key)`.
 */
export type RawUseFetch<Result> = (
  request: Parameters<typeof useFetch>[0],
  arg1?: VanillaFetchOptions | string,
  arg2?: string
) => Result

/** The `headers` option as vanilla types it: refs and getters at every level. */
type HeadersOption = NonNullable<VanillaFetchOptions>['headers']

// Takes the option with its outer ref or getter already read, and unwraps
// refs at every level below: vanilla's option type is
// `ComputedOptions<HeadersInit>`, and reading the raw object without
// unwrapping stringifies a ref to `[object Object]`.
function resolveHeadersInit(
  raw: ReturnType<typeof toValue<HeadersOption>>
): HeadersInit | undefined {
  if (raw === undefined) return undefined

  if (raw instanceof Headers) return raw

  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      const [name, value] = toValue(entry)

      return [String(toValue(name)), String(toValue(value))]
    })
  }

  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [name, String(toValue(value))])
  )
}

// The family's flattened merge, read inside a `computed`, so vanilla's deep
// watch on `headers` keeps tracking the caller's refs. A caller's own
// `accept` wins.
function withAcceptJson(headers: HeadersOption): ComputedRef<HeadersInit> {
  return computed(() =>
    flatHeadersAcceptingJson(resolveHeadersInit(toValue(headers)))
  )
}

/**
 * Vanilla `useFetch` (or its lazy twin) forwarding every argument, with only
 * the `accept` header merged into the options. Vanilla's last overload is its
 * runtime signature: the middle argument is the options or, when a call
 * passes none, the key the compiler appends.
 */
export function wrapVanillaFetch<Result>(
  vanilla: RawUseFetch<Result>
): RawUseFetch<Result> {
  return (request, arg1, arg2) => {
    const [opts, autoKey] = isString(arg1) ? [undefined, arg1] : [arg1, arg2]

    return vanilla(
      request,
      { ...opts, headers: withAcceptJson(opts?.headers) },
      autoKey
    )
  }
}

/**
 * The fetch composable named `name`: over Nuxt's own `useLazyFetch` when
 * `lazy`, rather than `useFetch` with `lazy: true`, so Nuxt's development
 * diagnostics name the call as they name vanilla's twin.
 */
export function betterFetchComposable(
  name: string,
  lazy: boolean
): UseBetterFetch {
  // SAFETY: vanilla's runtime reads a string second argument as the key the
  // compiler appends, and a third as that key after the options, on every
  // Nuxt 4, whether or not its public overloads declare them.
  const vanilla = (lazy ? useLazyFetch : useFetch) as RawUseFetch<
    ReturnType<typeof useFetch>
  >
  const composable = wrapVanillaFetch(vanilla)

  // What a stack trace and Vue's devtools show for a call.
  Object.defineProperty(composable, 'name', { value: name })

  // SAFETY: `UseBetterFetch` re-types vanilla's own call from the generated
  // maps and adds no member; the wrapper forwards every argument and only
  // merges `headers`, so vanilla's runtime honours each typed option, and the
  // `error` ref is the `NuxtError` vanilla makes of the failure, whose `data`
  // is the response body the route's Known error rides in.
  return composable as UseBetterFetch
}

/**
 * Drop-in `useFetch`: the route's Request input typed on the options, its
 * response on `data`, and its Known errors in the body of the `error` ref,
 * which `matchError(error, …)` reads by `_tag`.
 */
export const useBetterFetch = betterFetchComposable('useBetterFetch', false)

/** The lazy twin, over Nuxt's own `useLazyFetch`. */
export const useLazyBetterFetch = betterFetchComposable(
  'useLazyBetterFetch',
  true
)
