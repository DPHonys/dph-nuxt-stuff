import { CHANNEL_HEADER } from '@dphonys/nuxt-handler-errors/internals/shared'
import type { $Fetch as OfetchInstance } from 'ofetch'
import { createFetch } from 'ofetch'
import { afterEach, describe, expect, it } from 'vitest'
import { toValue } from 'vue'
import { useRequestTypedFetch } from '../../src/runtime/app/composables/use-request-typed-fetch'
import {
  useLazyTypedAsyncData,
  useTypedAsyncData,
} from '../../src/runtime/app/composables/use-typed-async-data'
import {
  useLazyTypedFetch,
  useTypedFetch,
} from '../../src/runtime/app/composables/use-typed-fetch'
import { $typedFetch } from '../../src/runtime/shared/typed-fetch'
import { setConfiguredChannelToken } from '../doubles/channel-token'
import { asyncDataCalls, calls, setRequestEvent } from '../doubles/nuxt-app'

// The umbrella's bindings of the parent's app internals: which vanilla
// composable each one delegates to, and that the channel header carries the
// token read through the umbrella's own alias. The merge itself, the `try`
// rethrow and the key injection are the parent's, tested there.

afterEach(() => {
  calls.length = 0
  asyncDataCalls.length = 0
  setConfiguredChannelToken(undefined)
  setRequestEvent(undefined)
})

describe('useTypedFetch and its lazy twin', () => {
  it.each([
    ['useTypedFetch', useTypedFetch, 'useFetch'],
    ['useLazyTypedFetch', useLazyTypedFetch, 'useLazyFetch'],
  ] as const)('%s delegates to vanilla’s %s', (_name, composable, vanilla) => {
    composable('/api/anything')

    expect(calls.map((call) => call.name)).toEqual([vanilla])
  })

  it('hands vanilla the umbrella’s configured token on every call', () => {
    setConfiguredChannelToken('umbrella-channel')
    useTypedFetch('/api/anything')

    setConfiguredChannelToken(undefined)
    useTypedFetch('/api/anything')

    expect(calls.map((call) => toValue(call.opts?.headers))).toEqual([
      { accept: 'application/json', [CHANNEL_HEADER]: 'umbrella-channel' },
      { accept: 'application/json' },
    ])
  })
})

describe('useTypedAsyncData and its lazy twin', () => {
  it.each([
    ['useTypedAsyncData', useTypedAsyncData, 'useAsyncData'],
    ['useLazyTypedAsyncData', useLazyTypedAsyncData, 'useLazyAsyncData'],
  ] as const)('%s delegates to vanilla’s %s', (_name, composable, vanilla) => {
    composable(() => Promise.resolve({ data: 'ok', error: undefined }))

    expect(asyncDataCalls.map((call) => call.name)).toEqual([vanilla])
  })
})

describe('useRequestTypedFetch', () => {
  // Under vitest `import.meta.client` is falsy, so what runs here is the
  // server branch - the only one with a choice to make.

  it('hands back the event’s own instance while rendering', () => {
    // A second real instance, derived from the global: `create` resolves the
    // `$fetch` global at the call, so one has to be there.
    const globals: { $fetch?: typeof globalThis.$fetch | OfetchInstance } =
      globalThis
    globals.$fetch = createFetch({})
    try {
      const bound = $typedFetch.create({})

      setRequestEvent({ $typedFetch: bound })

      expect(bound).not.toBe($typedFetch)
      expect(useRequestTypedFetch()).toBe(bound)
    } finally {
      delete globals.$fetch
    }
  })

  it('falls back to the global when there is no request event', () => {
    expect(useRequestTypedFetch()).toBe($typedFetch)
  })
})
