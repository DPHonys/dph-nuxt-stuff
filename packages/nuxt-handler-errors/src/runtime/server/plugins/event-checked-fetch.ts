import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import type { H3Event } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import type { NitroRuntimeHooks } from 'nitropack/types'
import type { CheckedFetch } from '../../types'
import type { RawEventFetch } from '../lib/event-checked-fetch'
import { createCheckedEventFetch } from '../lib/event-checked-fetch'

/**
 * The two slots the installer touches on an event: `$fetch` read on every
 * call, `$checkedFetch` written once. Nitro's own `event.$fetch` and the
 * reduced shape are both admitted, so a suite can hand in the reduced one;
 * the body is whatever the route answers. `undefined` is the version skew
 * the wrapper's guard names.
 */
export interface EventFetchSlots {
  $fetch?: H3Event['$fetch'] | RawEventFetch<unknown> | undefined
  $checkedFetch?: CheckedFetch
}

/**
 * Install `event.$checkedFetch` over the event's own fetch, read through a
 * thunk so the wrapper composes with later `event.$fetch` replacements.
 */
export function installEventCheckedFetch(event: EventFetchSlots): void {
  event.$checkedFetch = createCheckedEventFetch(
    () => event.$fetch,
    configuredChannelToken
  )
}

/** What the plugin needs from Nitro's app: registering on `request`. */
export interface RequestHookHost {
  hooks: {
    hook: (name: 'request', callback: NitroRuntimeHooks['request']) => void
  }
}

/** The `request` hook is the earliest point `event.$fetch` exists. */
export function registerEventCheckedFetch(nitroApp: RequestHookHost): void {
  nitroApp.hooks.hook('request', installEventCheckedFetch)
}

export default defineNitroPlugin(registerEventCheckedFetch)
