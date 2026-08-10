import { afterEach, describe, expect, it } from 'vitest'
import clientPlugin from '../../src/runtime/app/plugins/checked-fetch.client'
import { EventFetchUnavailableError } from '../../src/runtime/server/lib/event-checked-fetch'
import nitroPlugin from '../../src/runtime/server/plugins/checked-fetch'
import eventPlugin from '../../src/runtime/server/plugins/event-checked-fetch'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import { $checkedFetch } from '../../src/runtime/shared/checked-fetch'
import { setConfiguredChannelToken } from '../doubles/channel-token'
import { settled } from '../fetch-channel'

// What each of the three plugins does, not how it is registered - the aliased
// doubles hand each setup function back unchanged. Registration is module
// wiring, and its own test.

afterEach(() => {
  delete (globalThis as { $checkedFetch?: unknown }).$checkedFetch
})

describe('the global installers', () => {
  it.each([
    ['the client app plugin', clientPlugin],
    ['the Nitro plugin', nitroPlugin],
  ])('%s assigns the module’s own $checkedFetch', (_name, plugin) => {
    // Identity, not shape: a lookalike would be a second instance.
    expect(globalThis.$checkedFetch).toBeUndefined()

    ;(plugin as () => void)()

    expect(globalThis.$checkedFetch).toBe($checkedFetch)
  })
})

/** Nitro's app, reduced to the one hook this plugin registers on. */
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

describe('the event installer', () => {
  it('installs event.$checkedFetch from the request hook', () => {
    // The `request` hook is the earliest point `event.$fetch` exists.
    const nitro = fakeNitroApp()

    ;(eventPlugin as (app: unknown) => void)(nitro.app)

    expect(Object.keys(nitro.hooks)).toEqual(['request'])

    const event = { $fetch: () => Promise.resolve('ok') } as never

    nitro.hooks.request?.(event)

    expect(typeof (event as { $checkedFetch: unknown }).$checkedFetch).toBe(
      'function'
    )
  })

  it('reads event.$fetch through a thunk, not at install time', async () => {
    // So the wrapper composes with anything that replaces `event.$fetch` later
    // in the same hook chain.
    const nitro = fakeNitroApp()

    ;(eventPlugin as (app: unknown) => void)(nitro.app)

    const event: { $fetch?: unknown; $checkedFetch?: unknown } = {}

    nitro.hooks.request?.(event as never)

    const installed = event.$checkedFetch as (r: string) => Promise<unknown>

    expect(await settled(() => installed('/api/anything'))).toMatchObject({
      threw: true,
    })

    event.$fetch = (request: unknown) => Promise.resolve(request)

    expect(await installed('/api/anything')).toBe('/api/anything')
  })

  it('names the skew when event.$fetch is not there at all', async () => {
    const nitro = fakeNitroApp()

    ;(eventPlugin as (app: unknown) => void)(nitro.app)

    const event = {} as never

    nitro.hooks.request?.(event)

    const installed = (
      event as { $checkedFetch: (r: string) => Promise<unknown> }
    ).$checkedFetch

    const result = await settled(() => installed('/api/anything'))

    expect(result.value).toBeInstanceOf(EventFetchUnavailableError)
  })
})

describe('the channel tag the event installer supplies', () => {
  // The event wrapper takes the token as a parameter, and this plugin is the
  // one place that hands the build-time constant in.
  afterEach(() => {
    setConfiguredChannelToken(undefined)
  })

  it('hands the configured token to the per-request wrapper', async () => {
    setConfiguredChannelToken('first-party')

    const hooks: Record<string, (event: never) => void> = {}
    const app = {
      hooks: {
        hook: (name: string, handler: (event: never) => void) => {
          hooks[name] = handler
        },
      },
    }

    ;(eventPlugin as (app: unknown) => void)(app)

    const sent: unknown[] = []
    const event = {
      $fetch: (_request: unknown, init?: { headers?: unknown }) => {
        sent.push(init?.headers)

        return Promise.resolve('ok')
      },
    }

    hooks.request?.(event as never)

    await (
      event as unknown as { $checkedFetch: (r: string) => Promise<unknown> }
    ).$checkedFetch('/api/anything')

    expect(sent).toEqual([
      { accept: 'application/json', [CHANNEL_HEADER]: 'first-party' },
    ])
  })
})
