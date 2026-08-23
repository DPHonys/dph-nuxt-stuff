import { useRequestEvent } from '#app'
import { $typedFetch } from '../../shared/typed-fetch'
import type { TypedFetch } from '../../types/fetch'

/**
 * The request-bound typed fetch for SSR-safe imperative calls in app code -
 * Nuxt's `useRequestFetch()`, mirrored. A call made while rendering forwards
 * the incoming request's cookies and headers.
 */
export function useRequestTypedFetch(): TypedFetch {
  if (import.meta.client) return $typedFetch

  return useRequestEvent()?.$typedFetch || $typedFetch
}
