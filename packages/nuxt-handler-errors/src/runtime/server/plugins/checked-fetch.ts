/**
 * Installs `globalThis.$checkedFetch` in **Nitro**, which is what makes it
 * callable inside a Nitro handler with no new entry point: a route file writes
 * `$checkedFetch.try('/api/users/1')` exactly as it writes `$fetch`.
 *
 * This is **not** `event.$checkedFetch`, which forwards the incoming request's
 * cookies and context and is installed per request from a `request` hook. The
 * global forwards nothing, which is what `globalThis.$fetch` does too.
 */

import { defineNitroPlugin } from 'nitropack/runtime'
import { $checkedFetch } from '../../shared/checked-fetch'

export default defineNitroPlugin(() => {
  globalThis.$checkedFetch = $checkedFetch
})
