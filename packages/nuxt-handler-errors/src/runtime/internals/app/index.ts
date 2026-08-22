// The app-side internals `@dphonys/nuxt-typed-handler` composes its own
// composables from. Versioned with the umbrella, not this package's semver;
// not for application code. Imports `#app` and `vue`; must not reach
// `@nuxt/kit`, `nitropack/runtime`, or the channel-token alias - the wrappers
// take the token as a value, and the layering suite enforces it.

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
