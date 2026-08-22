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

// The parent's binding of the alias-free factory: everything but the token
// lives in `checked-fetch-factory.ts`, re-exported from here unchanged.
export { toNuxtError, toTryResult } from './checked-fetch-factory'
export type { RawTryResult } from './checked-fetch-factory'

// A getter rather than a snapshot: the alias is a live binding (the unit
// double sets it after the global is built), and the factory reads `token`
// on every call. Never spread - spreading would evaluate the getter once.
function bound(instanceHeaders: Headers): CheckedFetchFactoryOptions {
  return {
    get token() {
      return configuredChannelToken
    },
    instanceHeaders,
  }
}

/** The factory bound to this module's channel token. */
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
