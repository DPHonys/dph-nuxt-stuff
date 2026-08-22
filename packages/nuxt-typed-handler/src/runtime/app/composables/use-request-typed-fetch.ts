import { useRequestEvent } from '#app'
import { $typedFetch } from '../../shared/typed-fetch'
import type { TypedFetch } from '../../types/fetch'

/**
 * The request-bound typed fetch for SSR-safe imperative calls in app code -
 * Nuxt's `useRequestFetch()`, mirrored. A call made while rendering forwards
 * the incoming request's cookies and headers.
 */
// The errors parent's `/internals/app` exposes no request-fetch wrapper, so
// these few lines are its `useRequestCheckedFetch` reimplemented over the
// umbrella's own global and `event.$typedFetch` (spec §11 D3).
export function useRequestTypedFetch(): TypedFetch {
  if (import.meta.client) return $typedFetch

  return useRequestEvent()?.$typedFetch || $typedFetch
}
