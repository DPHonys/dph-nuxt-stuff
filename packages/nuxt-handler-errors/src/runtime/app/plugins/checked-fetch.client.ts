import { defineNuxtPlugin } from '#app'
import { $checkedFetch } from '../../shared/checked-fetch'

export default defineNuxtPlugin(() => {
  globalThis.$checkedFetch = $checkedFetch
})
