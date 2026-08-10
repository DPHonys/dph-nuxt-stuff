// Installs `globalThis.$checkedFetch` in Nitro. Not `event.$checkedFetch` —
// the global forwards nothing, exactly like `globalThis.$fetch`.

import { defineNitroPlugin } from 'nitropack/runtime'
import { $checkedFetch } from '../../shared/checked-fetch'

export default defineNitroPlugin(() => {
  globalThis.$checkedFetch = $checkedFetch
})
