import { wrapVanillaAsyncData } from '@dphonys/nuxt-handler-errors/internals/app'
import { useAsyncData, useLazyAsyncData } from '#app'
import type { UseTypedAsyncData } from '../../types/composables'

/**
 * Drop-in `useAsyncData` whose handler returns `.try` results instead of
 * throwing: the handler's declared union lands typed on the `error` ref,
 * `data` is the unwrapped success, and `matchError(error, …)` is the one read
 * path.
 *
 * ```ts
 * const { data, error } = await useTypedAsyncData('user', () =>
 *   $typedFetch.try(`/api/users/${id}`)
 * )
 * ```
 */
export const useTypedAsyncData = wrapVanillaAsyncData(
  useAsyncData
) as UseTypedAsyncData

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyAsyncData` rather than
 * passing `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call
 * correctly.
 */
export const useLazyTypedAsyncData = wrapVanillaAsyncData(
  useLazyAsyncData
) as UseTypedAsyncData
