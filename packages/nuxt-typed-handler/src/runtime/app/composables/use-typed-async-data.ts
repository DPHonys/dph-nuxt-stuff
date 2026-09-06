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
// SAFETY: the wrapper is vanilla's own variadic runtime signature, every
// argument forwarded to `useAsyncData` with only the handler rewrapped.
// `UseTypedAsyncData` is the parent's `UseCheckedAsyncData`, the signature
// the parent applies to this same wrapper.
export const useTypedAsyncData = wrapVanillaAsyncData(
  useAsyncData
) as UseTypedAsyncData

/**
 * The lazy twin. Delegates to Nuxt's own `useLazyAsyncData` rather than
 * passing `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call
 * correctly.
 */
// SAFETY: as above, over `useLazyAsyncData`.
export const useLazyTypedAsyncData = wrapVanillaAsyncData(
  useLazyAsyncData
) as UseTypedAsyncData
