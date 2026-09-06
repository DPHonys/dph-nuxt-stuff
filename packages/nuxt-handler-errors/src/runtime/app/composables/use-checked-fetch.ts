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

/**
 * Drop-in `useFetch` with the route's declared error union typed on the
 * `error` ref: `data` is what it always was, `error` still holds Nuxt's error
 * object, and `matchError(error, …)` is the one read path.
 */
// SAFETY: the overloads are vanilla's own with the error ref retyped by route;
// the wrapper forwards every argument and only merges headers, so vanilla's
// runtime honours each of them.
export const useCheckedFetch = wrapVanillaFetch(
  useFetch,
  bound
) as UseCheckedFetch

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyFetch` rather than passing
 * `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call correctly.
 */
// SAFETY: as for `useCheckedFetch` - the same wrapper over the lazy twin.
export const useLazyCheckedFetch = wrapVanillaFetch(
  useLazyFetch,
  bound
) as UseCheckedFetch
