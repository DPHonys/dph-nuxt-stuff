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

// The one place the wrapper's face changes: vanilla's runtime signature -
// `(request, opts | autoKey, autoKey)` forwarded with only `headers` merged -
// re-typed from the route map. Both composables go through it.
function typedFace(vanilla: typeof useFetch): UseTypedFetch {
  // SAFETY: `wrapVanillaFetch` returns vanilla's own runtime signature
  // untouched; `UseTypedFetch` re-types that call from the route map and adds
  // no member, so the wrapper serves as it is.
  return wrapVanillaFetch(vanilla, bound) as UseTypedFetch
}

/**
 * Drop-in `useFetch` with the route's Request input typed on the options and
 * its declared error union typed on the `error` ref: `data` is what it always
 * was, and `matchError(error, …)` is the one read path.
 */
export const useTypedFetch = typedFace(useFetch)

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyFetch` rather than passing
 * `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call correctly.
 */
export const useLazyTypedFetch = typedFace(useLazyFetch)
