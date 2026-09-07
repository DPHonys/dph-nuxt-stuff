import type { RawEventFetch } from '@dphonys/nuxt-handler-errors/internals/server'
import { EventFetchUnavailableError } from '@dphonys/nuxt-handler-errors/internals/server'
import { CHANNEL_HEADER } from '@dphonys/nuxt-handler-errors/internals/shared'
import { setConfiguredChannelToken } from '@dphonys/test-utils/doubles/channel-token'
import type { NitroFetchRequest, NitroRuntimeHooks } from 'nitropack/types'
import { createFetch } from 'ofetch'
import { afterEach, describe, expect, it } from 'vitest'
import clientPlugin from '../../src/runtime/app/plugins/typed-fetch.client'
import type {
  EventFetchSlots,
  RequestHookHost,
} from '../../src/runtime/server/plugins/event-typed-fetch'
import eventPlugin, {
  installEventTypedFetch,
  registerEventTypedFetch,
} from '../../src/runtime/server/plugins/event-typed-fetch'
import nitroPlugin from '../../src/runtime/server/plugins/typed-fetch'
import {
  $typedFetch,
  installTypedFetchGlobal,
} from '../../src/runtime/shared/typed-fetch'
import { globals } from '../doubles/fetch-globals'

// What each of the three plugins does, not how it is registered - the aliased
// doubles hand each setup function back unchanged. Registration is module
// wiring, and its own test. The runtime underneath is the errors parent's
// factories; what is asserted here is the umbrella's binding of them: its
// own global, its own alias's token.

/** The headers of every request a fetch double received, flattened. */
type SentHeaders = Record<string, string>[]

/**
 * A real ofetch instance over a native-fetch double, installed as the
 * `$fetch` global: what the umbrella's global forwards to at runtime.
 */
function installFetchDouble(
  sent: SentHeaders,
  answer: () => Promise<Response>
): void {
  globals.$fetch = createFetch({
    fetch: (_input, init) => {
      sent.push(Object.fromEntries(new Headers(init?.headers)))

      return answer()
    },
  })
}

const ok = (): Promise<Response> => Promise.resolve(Response.json('ok'))

/** An `event.$fetch` that answers with the request it was given. */
const echo: RawEventFetch<NitroFetchRequest> = (request) =>
  Promise.resolve(request)

afterEach(() => {
  delete globals.$typedFetch
  delete globals.$fetch
  setConfiguredChannelToken(undefined)
})

describe('the global installers', () => {
  it('assigns the module’s own $typedFetch', () => {
    // Identity, not shape: a lookalike would be a second instance.
    expect(globals.$typedFetch).toBeUndefined()

    installTypedFetchGlobal()

    expect(globals.$typedFetch).toBe($typedFetch)
  })

  it.each([
    ['the client app plugin', clientPlugin],
    ['the Nitro plugin', nitroPlugin],
  ])('%s is that installer, on its own side', (_name, plugin) => {
    expect(plugin).toBe(installTypedFetchGlobal)
  })

  it('reads the umbrella’s own channel token on every call', async () => {
    // The token is the module option under `typedHandler`, read through
    // `#nuxt-typed-handler/channel-token` - never the parent's alias.
    const sent: SentHeaders = []

    installFetchDouble(sent, ok)

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
    installFetchDouble([], () => Promise.reject(new Error('nope')))

    const result = await $typedFetch.try('/api/anything')

    expect(result.data).toBeUndefined()
    expect(result.error?.message).toContain('nope')
  })
})

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

    registerEventTypedFetch(host)

    expect(registered).toEqual([
      { name: 'request', callback: installEventTypedFetch },
    ])
    // The plugin's setup is the registrar itself.
    expect(eventPlugin).toBe(registerEventTypedFetch)
  })

  it('installs event.$typedFetch as a callable', () => {
    const event: EventFetchSlots = { $fetch: () => Promise.resolve('ok') }

    installEventTypedFetch(event)

    expect(event.$typedFetch).toBeInstanceOf(Function)
  })

  it('reads event.$fetch through a thunk, not at install time', async () => {
    // So the wrapper composes with anything that replaces `event.$fetch` later
    // in the same hook chain.
    const event: EventFetchSlots = {}

    installEventTypedFetch(event)

    const installed = event.$typedFetch

    // The skew guard throws at the call, outside any promise.
    expect(() => installed?.('/api/anything')).toThrow(
      EventFetchUnavailableError
    )

    event.$fetch = echo

    await expect(installed?.('/api/anything')).resolves.toBe('/api/anything')
  })

  it('names the skew when event.$fetch is not there at all', () => {
    // The parent's guard, preserved: the umbrella adds no wording of its own.
    const event: EventFetchSlots = {}

    installEventTypedFetch(event)

    expect(() => event.$typedFetch?.('/api/anything')).toThrow(
      EventFetchUnavailableError
    )
  })

  it('hands the umbrella’s configured token to the per-request wrapper', async () => {
    setConfiguredChannelToken('first-party')

    const sent: (HeadersInit | undefined)[] = []
    const recording: RawEventFetch<string> = (_request, init) => {
      sent.push(init?.headers)

      return Promise.resolve('ok')
    }
    const event: EventFetchSlots = { $fetch: recording }

    installEventTypedFetch(event)

    await event.$typedFetch?.('/api/anything')

    expect(sent).toEqual([
      { accept: 'application/json', [CHANNEL_HEADER]: 'first-party' },
    ])
  })
})
