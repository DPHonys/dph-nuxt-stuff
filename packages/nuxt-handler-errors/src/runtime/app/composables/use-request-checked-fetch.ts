import { useRequestEvent } from '#app'
import { $checkedFetch } from '../../shared/checked-fetch'
import type { CheckedFetch } from '../../types'

/**
 * The request-bound checked fetch for SSR-safe imperative calls in app code -
 * Nuxt's `useRequestFetch()`, mirrored. A call made while rendering forwards
 * the incoming request's cookies and headers.
 */
export function useRequestCheckedFetch(): CheckedFetch {
  if (import.meta.client) return $checkedFetch

  return useRequestEvent()?.$checkedFetch || $checkedFetch
}
