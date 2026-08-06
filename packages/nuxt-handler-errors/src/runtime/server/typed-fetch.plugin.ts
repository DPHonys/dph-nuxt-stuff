/**
 * Installs `globalThis.$typedFetch` in **Nitro**, which is what makes it
 * callable inside a Nitro handler with no new entry point: a route file writes
 * `$typedFetch.safe('/api/users/1')` exactly as it writes `$fetch`.
 *
 * This is **not** `event.$typedFetch`, which forwards the incoming request's
 * cookies and context and is installed per request from a `request` hook. The
 * global forwards nothing, which is what `globalThis.$fetch` does too.
 * `src/module.ts` carries the rest of the reasoning.
 */

import { defineNitroPlugin } from 'nitropack/runtime'
import { $typedFetch } from '../typed-fetch'

export default defineNitroPlugin(() => {
  globalThis.$typedFetch = $typedFetch
})
