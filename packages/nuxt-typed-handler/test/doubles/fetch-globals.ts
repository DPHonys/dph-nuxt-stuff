import type { $Fetch as OfetchInstance } from 'ofetch'

/**
 * `globalThis`, with the two fetch globals as the slots they are at runtime:
 * absent until a plugin installs them, and `$fetch` any ofetch instance -
 * Nitro's declarations say otherwise, and a suite has to put them back that
 * way.
 */
interface FetchGlobals {
  $typedFetch?: typeof globalThis.$typedFetch
  $fetch?: typeof globalThis.$fetch | OfetchInstance
}

export const globals: FetchGlobals = globalThis
