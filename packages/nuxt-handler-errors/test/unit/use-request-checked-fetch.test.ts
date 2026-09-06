import { afterEach, expect, it } from 'vitest'
import { useRequestCheckedFetch } from '../../src/runtime/app/composables/use-request-checked-fetch'
import { createCheckedEventFetch } from '../../src/runtime/server/lib/event-checked-fetch'
import { $checkedFetch } from '../../src/runtime/shared/checked-fetch'
import { setRequestEvent } from '../doubles/nuxt-app'

// Under vitest `import.meta.client` is falsy, so what runs here is the server
// branch - the only one with a choice to make.

afterEach(() => {
  setRequestEvent(undefined)
})

it('hands back the event’s own instance while rendering', () => {
  // A real event-bound instance over a stub fetch: identity is the claim.
  const bound = createCheckedEventFetch(() => async () => 'ok')

  setRequestEvent({ $checkedFetch: bound })

  expect(useRequestCheckedFetch()).toBe(bound)
})

it('falls back to the global when there is no request event', () => {
  expect(useRequestCheckedFetch()).toBe($checkedFetch)
})
