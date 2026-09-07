import { configuredChannelToken } from '#nuxt-typed-handler/channel-token'
import type { RawEventFetch } from '@dphonys/nuxt-handler-errors/internals/server'
import { createCheckedEventFetch } from '@dphonys/nuxt-handler-errors/internals/server'
import type { H3Event } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import type { NitroRuntimeHooks } from 'nitropack/types'
import type { TypedEventFetch } from '../../types/fetch'

/**
 * The two slots the installer touches on an event: `$fetch` read on every
 * call, `$typedFetch` written once. Nitro's own `event.$fetch` and the
 * parent's reduced shape are both admitted, so a suite can hand in the
 * reduced one; the body is whatever the route answers.
 */
export interface EventFetchSlots {
  $fetch?: H3Event['$fetch'] | RawEventFetch<unknown>
  $typedFetch?: TypedEventFetch
}

/**
 * Install `event.$typedFetch` over the event's own fetch, read through a
 * thunk so the wrapper composes with later `event.$fetch` replacements.
 */
export function installEventTypedFetch(event: EventFetchSlots): void {
  // SAFETY: `CheckedFetch` and `TypedEventFetch` are one runtime object - the
  // call and `.try` the parent factory returns, both forwarding untouched.
  // `TypedEventFetch` only re-types their options from the route map.
  event.$typedFetch = createCheckedEventFetch(
    () => event.$fetch,
    configuredChannelToken
  ) as TypedEventFetch
}

/** What the plugin needs from Nitro's app: registering on `request`. */
export interface RequestHookHost {
  hooks: {
    hook: (name: 'request', callback: NitroRuntimeHooks['request']) => void
  }
}

/** The `request` hook is the earliest point `event.$fetch` exists. */
export function registerEventTypedFetch(nitroApp: RequestHookHost): void {
  nitroApp.hooks.hook('request', installEventTypedFetch)
}

export default defineNitroPlugin(registerEventTypedFetch)
