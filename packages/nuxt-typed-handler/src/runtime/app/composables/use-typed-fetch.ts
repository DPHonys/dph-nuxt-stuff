import { configuredChannelToken } from '#nuxt-typed-handler/channel-token'
import type { FetchWrapperOptions } from '@dphonys/nuxt-handler-errors/internals/app'
import { wrapVanillaFetch } from '@dphonys/nuxt-handler-errors/internals/app'
import { useFetch, useLazyFetch } from '#app'
import type { UseTypedFetch } from '../../types/composables'

// A getter: the alias is a live binding the unit double sets after the
// composables are built, and the wrapper reads `token` on every call.
const bound: FetchWrapperOptions = {
  get token() {
    return configuredChannelToken
  },
}

/**
 * Drop-in `useFetch` with the route's Request input typed on the options and
 * its declared error union typed on the `error` ref: `data` is what it always
 * was, and `matchError(error, …)` is the one read path.
 */
export const useTypedFetch = wrapVanillaFetch(useFetch, bound) as UseTypedFetch

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyFetch` rather than passing
 * `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call correctly.
 */
export const useLazyTypedFetch = wrapVanillaFetch(
  useLazyFetch,
  bound
) as UseTypedFetch
