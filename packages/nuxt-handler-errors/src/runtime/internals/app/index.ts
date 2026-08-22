// Not application API: versioned with the umbrella module, not this package.
// What this layer may import is asserted in `test/unit/layering.test.ts`.

export { wrapVanillaFetch } from '../../app/composables/fetch-wrapper'
export type {
  FetchWrapperOptions,
  KnownErrorRef,
  RawUseFetch,
  UseCheckedFetch,
} from '../../app/composables/fetch-wrapper'
export { wrapVanillaAsyncData } from '../../app/composables/use-checked-async-data'
export type {
  FailureOf,
  RawUseAsyncData,
  SuccessOf,
  TrySource,
  UseCheckedAsyncData,
} from '../../app/composables/use-checked-async-data'
