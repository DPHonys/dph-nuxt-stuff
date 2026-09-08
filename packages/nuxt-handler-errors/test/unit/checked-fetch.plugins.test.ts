import { setConfiguredChannelToken } from '@dphonys/test-utils/doubles/channel-token'
import type { NitroRuntimeHooks } from 'nitropack/types'
import { afterEach, describe, expect, it } from 'vitest'
import clientPlugin from '../../src/runtime/app/plugins/checked-fetch.client'
import { EventFetchUnavailableError } from '../../src/runtime/server/lib/event-checked-fetch'
import type { RawEventFetch } from '../../src/runtime/server/lib/event-checked-fetch'
import nitroPlugin from '../../src/runtime/server/plugins/checked-fetch'
import type {
  EventFetchSlots,
  RequestHookHost,
} from '../../src/runtime/server/plugins/event-checked-fetch'
import eventPlugin, {
  installEventCheckedFetch,
  registerEventCheckedFetch,
} from '../../src/runtime/server/plugins/event-checked-fetch'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import {
  $checkedFetch,
  installCheckedFetchGlobal,
} from '../../src/runtime/shared/checked-fetch'
import type { CheckedFetch } from '../../src/runtime/types'
import { settled } from '../fetch-channel'

// What each of the three plugins does, not how it is registered - the aliased
// doubles hand each setup function back unchanged. Registration is module
// wiring, and its own test.

afterEach(() => {
  Reflect.deleteProperty(globalThis, '$checkedFetch')
})

describe('the global installers', () => {
  it('assigns the module’s own $checkedFetch', () => {
    // Identity, not shape: a lookalike would be a second instance.
    expect(globalThis.$checkedFetch).toBeUndefined()

    installCheckedFetchGlobal()

    expect(globalThis.$checkedFetch).toBe($checkedFetch)
  })

  it.each([
    ['the client app plugin', clientPlugin],
    ['the Nitro plugin', nitroPlugin],
  ])('%s is that installer, on its own side', (_name, plugin) => {
    expect(plugin).toBe(installCheckedFetchGlobal)
  })
})

/**
 * An event reduced to the two members the installer touches: it reads
 * `$fetch` and writes `$checkedFetch`. `fetch` is live - a later assignment
 * shows through, which is what the thunk test needs.
 */
function fakeEvent(fetch: RawEventFetch<string> | undefined) {
  const state = { fetch }

  const event: EventFetchSlots = {
    get $fetch() {
      return state.fetch
    },
  }

  return { event, state }
}

/** The instance the installer wrote, or a failure naming its absence. */
function installedOn(event: EventFetchSlots): CheckedFetch {
  if (event.$checkedFetch === undefined) {
    throw new Error('event.$checkedFetch was not installed')
  }

  return event.$checkedFetch
}

describe('the event installer', () => {
  it('registers the installer on the request hook, and nothing else', () => {
    // The `request` hook is the earliest point `event.$fetch` exists.
    const registered: {
      name: string
      callback: NitroRuntimeHooks['request']
    }[] = []
    const host: RequestHookHost = {
      hooks: {
        hook: (name, callback) => {
          registered.push({ name, callback })
        },
      },
    }

    registerEventCheckedFetch(host)

    expect(registered).toEqual([
      { name: 'request', callback: installEventCheckedFetch },
    ])
    // The plugin's setup is the registrar itself.
    expect(eventPlugin).toBe(registerEventCheckedFetch)
  })

  it('installs event.$checkedFetch as a callable', () => {
    const { event } = fakeEvent(() => Promise.resolve('ok'))

    installEventCheckedFetch(event)

    expect(event.$checkedFetch).toBeTypeOf('function')
  })

  it('reads event.$fetch through a thunk, not at install time', async () => {
    // So the wrapper composes with anything that replaces `event.$fetch` later
    // in the same hook chain.
    const { event, state } = fakeEvent(undefined)

    installEventCheckedFetch(event)

    const installed = installedOn(event)

    expect(await settled(() => installed('/api/anything'))).toMatchObject({
      threw: true,
    })

    state.fetch = (request) => Promise.resolve(String(request))

    expect(await installed('/api/anything')).toBe('/api/anything')
  })

  it('names the skew when event.$fetch is not there at all', async () => {
    const { event } = fakeEvent(undefined)

    installEventCheckedFetch(event)

    const result = await settled(() => installedOn(event)('/api/anything'))

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

    const sent: (HeadersInit | undefined)[] = []
    const { event } = fakeEvent((_request, init) => {
      sent.push(init?.headers)

      return Promise.resolve('ok')
    })

    installEventCheckedFetch(event)

    await installedOn(event)('/api/anything')

    expect(sent).toEqual([
      { accept: 'application/json', [CHANNEL_HEADER]: 'first-party' },
    ])
  })
})
