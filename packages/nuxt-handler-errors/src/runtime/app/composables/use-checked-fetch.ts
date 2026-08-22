import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { useFetch, useLazyFetch } from '#app'
import type { FetchWrapperOptions, UseCheckedFetch } from './fetch-wrapper'
import { wrapVanillaFetch } from './fetch-wrapper'

// The parent's binding of the alias-free wrapper: the merge and the
// signature live in `fetch-wrapper.ts`, re-exported from here unchanged.
export type { KnownErrorRef, UseCheckedFetch } from './fetch-wrapper'

// A getter rather than a snapshot: the alias is a live binding (the unit
// double sets it after the composables are built), and the wrapper reads
// `token` on every call.
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
export const useCheckedFetch = wrapVanillaFetch(
  useFetch,
  bound
) as UseCheckedFetch

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyFetch` rather than passing
 * `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call correctly.
 */
export const useLazyCheckedFetch = wrapVanillaFetch(
  useLazyFetch,
  bound
) as UseCheckedFetch
