import { CHANNEL_HEADER } from '@dphonys/nuxt-handler-errors/internals/shared'
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
import type { TypedFetch } from '../../src/runtime/types'
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
    ;(composable as (request: unknown) => unknown)('/api/anything')

    expect(calls.map((call) => call.name)).toEqual([vanilla])
  })

  it('hands vanilla the umbrella’s configured token on every call', () => {
    setConfiguredChannelToken('umbrella-channel')
    ;(useTypedFetch as (request: unknown) => unknown)('/api/anything')

    setConfiguredChannelToken(undefined)
    ;(useTypedFetch as (request: unknown) => unknown)('/api/anything')

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
    ;(composable as (handler: unknown) => unknown)(() =>
      Promise.resolve({ data: 'ok', error: undefined })
    )

    expect(asyncDataCalls.map((call) => call.name)).toEqual([vanilla])
  })
})

describe('useRequestTypedFetch', () => {
  // Under vitest `import.meta.client` is falsy, so what runs here is the
  // server branch - the only one with a choice to make.

  it('hands back the event’s own instance while rendering', () => {
    const bound = (() => Promise.resolve('ok')) as unknown as TypedFetch

    setRequestEvent({ $typedFetch: bound })

    expect(useRequestTypedFetch()).toBe(bound)
  })

  it('falls back to the global when there is no request event', () => {
    expect(useRequestTypedFetch()).toBe($typedFetch)
  })
})
