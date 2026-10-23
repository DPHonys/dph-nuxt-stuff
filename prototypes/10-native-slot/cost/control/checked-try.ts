// PROTOTYPE (ticket 10), question 4 control: the errors parent's
// `O`-inferring `.try` (`TryResultFor`, packages/nuxt-handler-errors on main),
// with no better-handler fetch code in the program.
import type { $CheckedFetch } from '../../../../packages/nuxt-handler-errors/src/runtime/types'

declare const $checkedFetch: $CheckedFetch

export async function main() {
  const a = await $checkedFetch.try('/api/users', {
    method: 'post',
    body: { name: 'a' },
  })
  const b = await $checkedFetch.try('/api/users')
  const c = await $checkedFetch.try('/api/items/1', { method: 'put' })
  return [a, b, c]
}
