// The isomorphic internals `@dphonys/nuxt-typed-handler` composes its own
// fetch surfaces from. Versioned with the umbrella, not this package's semver;
// not for application code. May import `h3`; must not reach `@nuxt/kit`,
// `nitropack/runtime`, `#app`, or the channel-token alias - every factory
// takes the token as a value, and the layering suite enforces it.

export {
  createCheckedFetch,
  lazyGlobalFetch,
  toNuxtError,
  toTryResult,
} from '../../shared/checked-fetch-factory'
export type {
  CheckedFetchFactoryOptions,
  RawFetch,
  RawOptions,
  RawTryResult,
} from '../../shared/checked-fetch-factory'
export { knownErrorMarker } from '../../shared/wire'
export { readFloor } from '../../shared/match-error'
export { CHANNEL_HEADER } from '../../shared/channel'
