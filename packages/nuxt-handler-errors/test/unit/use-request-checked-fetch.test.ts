import { afterEach, expect, it } from 'vitest'
import { useRequestCheckedFetch } from '../../src/runtime/app/composables/use-request-checked-fetch'
import { $checkedFetch } from '../../src/runtime/shared/checked-fetch'
import type { CheckedFetch } from '../../src/runtime/types'
import { setRequestEvent } from '../doubles/nuxt-app'

/**
 * The three-line mirror of vanilla's `useRequestFetch()`: the request-bound
 * instance while rendering, the global otherwise. Under vitest `import.meta
 * .client` is falsy, so what runs here is the server branch — the only one with
 * a choice to make.
 */

afterEach(() => {
  setRequestEvent(undefined)
})

it('hands back the event’s own instance while rendering', () => {
  const bound = (() => Promise.resolve('ok')) as unknown as CheckedFetch

  setRequestEvent({ $checkedFetch: bound })

  expect(useRequestCheckedFetch()).toBe(bound)
})

it('falls back to the global when there is no request event', () => {
  // Vanilla's own `|| $fetch`: a call outside a request still has to work.
  expect(useRequestCheckedFetch()).toBe($checkedFetch)
})
