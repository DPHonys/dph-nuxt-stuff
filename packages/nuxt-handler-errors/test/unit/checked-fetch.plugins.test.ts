import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack/types'
import { afterEach, describe, expect, it } from 'vitest'
import type { NuxtApp } from '#app'
import clientPlugin from '../../src/runtime/app/plugins/checked-fetch.client'
import { EventFetchUnavailableError } from '../../src/runtime/server/lib/event-checked-fetch'
import type { RawEventFetch } from '../../src/runtime/server/lib/event-checked-fetch'
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
  Reflect.deleteProperty(globalThis, '$checkedFetch')
})

// SAFETY: the two global installers assign `globalThis.$checkedFetch` and
// read nothing off the app they are handed; a bare object stands in for each.
const nuxtApp = {} as NuxtApp
// SAFETY: as above, for the Nitro side.
const bareNitroApp = {} as NitroApp

describe('the global installers', () => {
  it.each([
    ['the client app plugin', () => clientPlugin(nuxtApp)],
    ['the Nitro plugin', () => nitroPlugin(bareNitroApp)],
  ])('%s assigns the module’s own $checkedFetch', (_name, install) => {
    // Identity, not shape: a lookalike would be a second instance.
    expect(globalThis.$checkedFetch).toBeUndefined()

    install()

    expect(globalThis.$checkedFetch).toBe($checkedFetch)
  })
})

/** Nitro's app, reduced to the one hook this plugin registers on. */
function fakeNitroApp() {
  const hooks = new Map<string, (event: H3Event) => void>()

  const registry = {
    hooks: {
      hook: (name: string, handler: (event: H3Event) => void) => {
        hooks.set(name, handler)
      },
    },
  }

  // SAFETY: the event installer calls `hooks.hook('request', …)` and reads
  // nothing else off the app; `registry` carries exactly that member.
  const app = registry as NitroApp

  return { app, hooks }
}

/**
 * An event reduced to the two members the request hook touches: it reads
 * `$fetch` and writes `$checkedFetch`. `fetch` is live - a later assignment
 * shows through, which is what the thunk test needs.
 */
function fakeEvent(fetch: RawEventFetch<string> | undefined) {
  const state = { fetch }

  const target = {
    get $fetch() {
      return state.fetch
    },
  }

  // SAFETY: the request hook reads `event.$fetch` and assigns
  // `event.$checkedFetch`; `target` carries the first and receives the
  // second, and nothing else of the event is touched.
  const event = target as H3Event

  return { event, state }
}

describe('the event installer', () => {
  it('installs event.$checkedFetch from the request hook', () => {
    // The `request` hook is the earliest point `event.$fetch` exists.
    const nitro = fakeNitroApp()

    eventPlugin(nitro.app)

    expect([...nitro.hooks.keys()]).toEqual(['request'])

    const { event } = fakeEvent(() => Promise.resolve('ok'))

    nitro.hooks.get('request')?.(event)

    expect(event.$checkedFetch).toBeTypeOf('function')
  })

  it('reads event.$fetch through a thunk, not at install time', async () => {
    // So the wrapper composes with anything that replaces `event.$fetch` later
    // in the same hook chain.
    const nitro = fakeNitroApp()

    eventPlugin(nitro.app)

    const { event, state } = fakeEvent(undefined)

    nitro.hooks.get('request')?.(event)

    const installed = event.$checkedFetch

    expect(await settled(() => installed('/api/anything'))).toMatchObject({
      threw: true,
    })

    state.fetch = (request) => Promise.resolve(String(request))

    expect(await installed('/api/anything')).toBe('/api/anything')
  })

  it('names the skew when event.$fetch is not there at all', async () => {
    const nitro = fakeNitroApp()

    eventPlugin(nitro.app)

    const { event } = fakeEvent(undefined)

    nitro.hooks.get('request')?.(event)

    const result = await settled(() => event.$checkedFetch('/api/anything'))

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

    const nitro = fakeNitroApp()

    eventPlugin(nitro.app)

    const sent: (HeadersInit | undefined)[] = []
    const { event } = fakeEvent((_request, init) => {
      sent.push(init?.headers)

      return Promise.resolve('ok')
    })

    nitro.hooks.get('request')?.(event)

    await event.$checkedFetch('/api/anything')

    expect(sent).toEqual([
      { accept: 'application/json', [CHANNEL_HEADER]: 'first-party' },
    ])
  })
})
