// Not application API: versioned with the umbrella module, not this package.
// What this layer may import is asserted in `test/unit/layering.test.ts`.

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
