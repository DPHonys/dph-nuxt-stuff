import { defineNuxtPlugin } from '#app'
import { $typedFetch } from '../../shared/typed-fetch'

export default defineNuxtPlugin(() => {
  globalThis.$typedFetch = $typedFetch
})
