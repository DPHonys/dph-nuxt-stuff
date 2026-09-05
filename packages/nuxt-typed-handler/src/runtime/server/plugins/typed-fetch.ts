import { defineNitroPlugin } from 'nitropack/runtime'
import { $typedFetch } from '../../shared/typed-fetch'

export default defineNitroPlugin(() => {
  globalThis.$typedFetch = $typedFetch
})
