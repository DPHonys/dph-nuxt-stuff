import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { useFetch, useLazyFetch } from '#app'
import type { FetchWrapperOptions, UseCheckedFetch } from './fetch-wrapper'
import { wrapVanillaFetch } from './fetch-wrapper'

export type { KnownErrorRef, UseCheckedFetch } from './fetch-wrapper'

// A getter: the alias is a live binding the unit double sets after the
// composables are built, and the wrapper reads `token` on every call.
const bound: FetchWrapperOptions = {
  get token() {
    return configuredChannelToken
  },
}

// The one place the route-typed face goes on: vanilla's runtime signature
// wrapped, then read through the checked overloads.
function checkedFace(vanilla: typeof useFetch): UseCheckedFetch {
  // SAFETY: the overloads are vanilla's own with the error ref retyped by
  // route; the wrapper forwards every argument and only merges headers, so
  // vanilla's runtime honours each of them.
  return wrapVanillaFetch(vanilla, bound) as UseCheckedFetch
}

/**
 * Drop-in `useFetch` with the route's declared error union typed on the
 * `error` ref: `data` is what it always was, `error` still holds Nuxt's error
 * object, and `matchError(error, …)` is the one read path.
 */
export const useCheckedFetch = checkedFace(useFetch)

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyFetch` rather than passing
 * `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call correctly.
 */
export const useLazyCheckedFetch = checkedFace(useLazyFetch)
