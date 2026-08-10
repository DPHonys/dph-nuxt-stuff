/**
 * `useRequestCheckedFetch()` — vanilla's `useRequestFetch()`, mirrored: the
 * request-bound instance for SSR-safe imperative calls in app code, so a call
 * made while rendering forwards the incoming request's cookies and headers.
 *
 * Three lines, exactly as vanilla's are, and the return type is the **seam**
 * rather than the global's namespace: on the server vanilla hands back the bare
 * event-bound closure, so anything beyond the call and `.try` would be typed
 * and absent.
 */

import { useRequestEvent } from '#app'
import { $checkedFetch } from '../../shared/checked-fetch'
import type { CheckedFetch } from '../../types'

export function useRequestCheckedFetch(): CheckedFetch {
  if (import.meta.client) return $checkedFetch

  return useRequestEvent()?.$checkedFetch || $checkedFetch
}
