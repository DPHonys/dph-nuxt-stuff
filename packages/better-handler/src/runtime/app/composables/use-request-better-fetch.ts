import { useRequestEvent } from '#app'
import { $betterFetch } from '../../shared/better-fetch'
import type { UseRequestBetterFetch } from '../../types/composables'

/**
 * The fetch family for imperative calls in app code that are safe during
 * server-side rendering, as Nuxt's `useRequestFetch()` is: while rendering,
 * the rendered request's own `event.$betterFetch`, which forwards its cookies
 * and headers; in the browser, and wherever no request is being rendered,
 * the global.
 */
export const useRequestBetterFetch: UseRequestBetterFetch = () => {
  if (import.meta.client) return $betterFetch

  return useRequestEvent()?.$betterFetch ?? $betterFetch
}
