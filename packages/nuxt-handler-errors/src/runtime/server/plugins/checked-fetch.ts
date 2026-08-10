import { defineNitroPlugin } from 'nitropack/runtime'
import { $checkedFetch } from '../../shared/checked-fetch'

export default defineNitroPlugin(() => {
  globalThis.$checkedFetch = $checkedFetch
})
