import { configuredChannelToken } from '#nuxt-typed-handler/channel-token'
import type { CheckedFetchFactoryOptions } from '@dphonys/nuxt-handler-errors/internals/shared'
import {
  createCheckedFetch,
  lazyGlobalFetch,
} from '@dphonys/nuxt-handler-errors/internals/shared'
import type { $TypedFetch } from '../types/fetch'

// A getter, never spread: the alias is a live binding the unit double sets
// after the global is built, and the factory reads `token` on every call.
const bound: CheckedFetchFactoryOptions = {
  get token() {
    return configuredChannelToken
  },
}

/** The value the module installs on `globalThis` - one object on every side. */
export const $typedFetch = createCheckedFetch(
  lazyGlobalFetch,
  bound
) as $TypedFetch
