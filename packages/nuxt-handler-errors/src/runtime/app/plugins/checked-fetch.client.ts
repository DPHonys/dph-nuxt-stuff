// Installs `globalThis.$checkedFetch` in the browser. Registered client-only;
// `src/module.ts` is where that decision lives.

import { defineNuxtPlugin } from '#app'
import { $checkedFetch } from '../../shared/checked-fetch'

export default defineNuxtPlugin(() => {
  globalThis.$checkedFetch = $checkedFetch
})
