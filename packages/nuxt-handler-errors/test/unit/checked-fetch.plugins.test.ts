import { afterEach, describe, expect, it } from 'vitest'
import clientPlugin from '../../src/runtime/app/plugins/checked-fetch.client'
import { EventFetchUnavailableError } from '../../src/runtime/server/lib/event-checked-fetch'
import nitroPlugin from '../../src/runtime/server/plugins/checked-fetch'
import eventPlugin from '../../src/runtime/server/plugins/event-checked-fetch'
import { $checkedFetch } from '../../src/runtime/shared/checked-fetch'
import { settled } from '../fetch-channel'

/**
 * What each of the three plugins does, and nothing about how it is registered:
 * the split into three exists so that each is deletable with a mutation that
 * reddens only its own test, and that only holds if each test executes exactly
 * one setup function.
 *
 * Both app-side and Nitro-side entry points load here through the doubles
 * `vitest.config.ts` aliases in — `defineNuxtPlugin` and `defineNitroPlugin`
 * both hand the setup function back unchanged. That the plugins are *registered*
 * (client-only, Nitro-side) is module wiring, and its own test.
 */

afterEach(() => {
  delete (globalThis as { $checkedFetch?: unknown }).$checkedFetch
})

describe('the global installers', () => {
  it.each([
    ['the client app plugin', clientPlugin],
    ['the Nitro plugin', nitroPlugin],
  ])('%s assigns the module’s own $checkedFetch', (_name, plugin) => {
    // Identity, not shape: a plugin that installed a lookalike would pass every
    // shape check and still be a second instance, with the instance-identity
    // problem that brings.
    expect(globalThis.$checkedFetch).toBeUndefined()

    ;(plugin as () => void)()

    expect(globalThis.$checkedFetch).toBe($checkedFetch)
  })
})

describe('the event installer', () => {
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

  it('installs event.$checkedFetch from the request hook', () => {
    // The `request` hook is the earliest point `event.$fetch` exists — Nitro
    // assigns its own four per-request closures and then calls it — so this is
    // a fifth closure beside four that already exist.
    const nitro = fakeNitroApp()

    ;(eventPlugin as unknown as (app: unknown) => void)(nitro.app)

    expect(Object.keys(nitro.hooks)).toEqual(['request'])

    const event = { $fetch: () => Promise.resolve('ok') } as never

    nitro.hooks.request?.(event)

    expect(typeof (event as { $checkedFetch: unknown }).$checkedFetch).toBe(
      'function'
    )
  })

  it('reads event.$fetch through a thunk, not at install time', async () => {
    // So the wrapper composes with anything that replaces `event.$fetch` later
    // in the same hook chain — and so the skew guard reports the state at
    // *call* time rather than the state one hook earlier.
    const nitro = fakeNitroApp()

    ;(eventPlugin as unknown as (app: unknown) => void)(nitro.app)

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

    ;(eventPlugin as unknown as (app: unknown) => void)(nitro.app)

    const event = {} as never

    nitro.hooks.request?.(event)

    const installed = (
      event as { $checkedFetch: (r: string) => Promise<unknown> }
    ).$checkedFetch

    const result = await settled(() => installed('/api/anything'))

    expect(result.value).toBeInstanceOf(EventFetchUnavailableError)
  })
})
