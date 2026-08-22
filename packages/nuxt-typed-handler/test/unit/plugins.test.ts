import { EventFetchUnavailableError } from '@dphonys/nuxt-handler-errors/internals/server'
import {
  CHANNEL_HEADER,
  lazyGlobalFetch,
} from '@dphonys/nuxt-handler-errors/internals/shared'
import { afterEach, describe, expect, it } from 'vitest'
import clientPlugin from '../../src/runtime/app/plugins/typed-fetch.client'
import eventPlugin from '../../src/runtime/server/plugins/event-typed-fetch'
import nitroPlugin from '../../src/runtime/server/plugins/typed-fetch'
import { $typedFetch } from '../../src/runtime/shared/typed-fetch'
import { setConfiguredChannelToken } from '../doubles/channel-token'

// What each of the three plugins does, not how it is registered - the aliased
// doubles hand each setup function back unchanged. Registration is module
// wiring, and its own test. The runtime underneath is the errors parent's
// factories; what is asserted here is the umbrella's binding of them: its
// own global, its own alias's token.

/** Whether a call threw, and with what. */
async function settled(
  run: () => Promise<unknown>
): Promise<{ threw: boolean; value: unknown }> {
  try {
    return { threw: false, value: await run() }
  } catch (error) {
    return { threw: true, value: error }
  }
}

/** Nitro's app, reduced to the one hook the event plugin registers on. */
function fakeNitroApp() {
  const hooks: Record<string, (event: never) => void> = {}

  return {
    app: {
      hooks: {
        hook: (name: string, handler: (event: never) => void) => {
          hooks[name] = handler
        },
      },
    },
    hooks,
  }
}

afterEach(() => {
  delete (globalThis as { $typedFetch?: unknown }).$typedFetch
  delete (globalThis as { $fetch?: unknown }).$fetch
  setConfiguredChannelToken(undefined)
})

describe('the global installers', () => {
  it.each([
    ['the client app plugin', clientPlugin],
    ['the Nitro plugin', nitroPlugin],
  ])('%s assigns the module’s own $typedFetch', (_name, plugin) => {
    // Identity, not shape: a lookalike would be a second instance.
    expect(globalThis.$typedFetch).toBeUndefined()

    ;(plugin as () => void)()

    expect(globalThis.$typedFetch).toBe($typedFetch)
  })

  it('reads the umbrella’s own channel token on every call', async () => {
    // The token is the module option under `typedHandler`, read through
    // `#nuxt-typed-handler/channel-token` - never the parent's alias.
    const sent: unknown[] = []

    ;(globalThis as { $fetch?: unknown }).$fetch = Object.assign(
      (_request: unknown, init?: { headers?: HeadersInit }) => {
        sent.push(Object.fromEntries(new Headers(init?.headers)))

        return Promise.resolve('ok')
      },
      { raw: () => Promise.resolve(), create: () => lazyGlobalFetch }
    )

    setConfiguredChannelToken('umbrella-channel')
    await $typedFetch('/api/anything')

    setConfiguredChannelToken(undefined)
    await $typedFetch('/api/anything')

    expect(sent).toEqual([
      { accept: 'application/json', [CHANNEL_HEADER]: 'umbrella-channel' },
      { accept: 'application/json' },
    ])
  })

  it('folds a failure into the try-shape rather than throwing', async () => {
    ;(globalThis as { $fetch?: unknown }).$fetch = Object.assign(
      () => Promise.reject(new Error('nope')),
      { raw: () => Promise.resolve(), create: () => lazyGlobalFetch }
    )

    const result = await $typedFetch.try('/api/anything')

    expect(result.data).toBeUndefined()
    expect(result.error?.message).toBe('nope')
  })
})

describe('the event installer', () => {
  it('installs event.$typedFetch from the request hook', () => {
    // The `request` hook is the earliest point `event.$fetch` exists.
    const nitro = fakeNitroApp()

    ;(eventPlugin as (app: unknown) => void)(nitro.app)

    expect(Object.keys(nitro.hooks)).toEqual(['request'])

    const event = { $fetch: () => Promise.resolve('ok') } as never

    nitro.hooks.request?.(event)

    expect(typeof (event as { $typedFetch: unknown }).$typedFetch).toBe(
      'function'
    )
  })

  it('reads event.$fetch through a thunk, not at install time', async () => {
    // So the wrapper composes with anything that replaces `event.$fetch` later
    // in the same hook chain.
    const nitro = fakeNitroApp()

    ;(eventPlugin as (app: unknown) => void)(nitro.app)

    const event: { $fetch?: unknown; $typedFetch?: unknown } = {}

    nitro.hooks.request?.(event as never)

    const installed = event.$typedFetch as (r: string) => Promise<unknown>

    expect(await settled(() => installed('/api/anything'))).toMatchObject({
      threw: true,
    })

    event.$fetch = (request: unknown) => Promise.resolve(request)

    expect(await installed('/api/anything')).toBe('/api/anything')
  })

  it('names the skew when event.$fetch is not there at all', async () => {
    // The parent's guard, preserved: the umbrella adds no wording of its own.
    const nitro = fakeNitroApp()

    ;(eventPlugin as (app: unknown) => void)(nitro.app)

    const event = {} as never

    nitro.hooks.request?.(event)

    const installed = (
      event as { $typedFetch: (r: string) => Promise<unknown> }
    ).$typedFetch

    const result = await settled(() => installed('/api/anything'))

    expect(result.value).toBeInstanceOf(EventFetchUnavailableError)
  })

  it('hands the umbrella’s configured token to the per-request wrapper', async () => {
    setConfiguredChannelToken('first-party')

    const nitro = fakeNitroApp()

    ;(eventPlugin as (app: unknown) => void)(nitro.app)

    const sent: unknown[] = []
    const event = {
      $fetch: (_request: unknown, init?: { headers?: unknown }) => {
        sent.push(init?.headers)

        return Promise.resolve('ok')
      },
    }

    nitro.hooks.request?.(event as never)

    await (
      event as unknown as { $typedFetch: (r: string) => Promise<unknown> }
    ).$typedFetch('/api/anything')

    expect(sent).toEqual([
      { accept: 'application/json', [CHANNEL_HEADER]: 'first-party' },
    ])
  })
})
