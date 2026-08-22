import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import type { $CheckedFetch } from '../types/fetch'
import type {
  CheckedFetchFactoryOptions,
  RawFetch,
} from './checked-fetch-factory'
import {
  createCheckedFetch as createCheckedFetchWith,
  lazyGlobalFetch,
} from './checked-fetch-factory'

export { toNuxtError, toTryResult } from './checked-fetch-factory'
export type { RawTryResult } from './checked-fetch-factory'

// A getter, never spread: the alias is a live binding the unit double sets
// after the global is built, and the factory reads `token` on every call.
function bound(instanceHeaders: Headers): CheckedFetchFactoryOptions {
  return {
    get token() {
      return configuredChannelToken
    },
    instanceHeaders,
  }
}

export function createCheckedFetch(
  base: RawFetch,
  instanceHeaders: Headers = new Headers()
): $CheckedFetch {
  return createCheckedFetchWith(base, bound(instanceHeaders))
}

/** The value the module installs on `globalThis` - one object on every side. */
export const $checkedFetch: $CheckedFetch = createCheckedFetchWith(
  lazyGlobalFetch,
  bound(new Headers())
)
