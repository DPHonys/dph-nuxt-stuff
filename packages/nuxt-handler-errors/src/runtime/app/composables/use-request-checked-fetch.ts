import { useRequestEvent } from '#app'
import { $checkedFetch } from '../../shared/checked-fetch'
import type { CheckedFetch } from '../../types'

/**
 * Vanilla's `useRequestFetch()`, mirrored: the request-bound instance for
 * SSR-safe imperative calls in app code, so a call made while rendering
 * forwards the incoming request's cookies and headers.
 */
export function useRequestCheckedFetch(): CheckedFetch {
  if (import.meta.client) return $checkedFetch

  return useRequestEvent()?.$checkedFetch || $checkedFetch
}
