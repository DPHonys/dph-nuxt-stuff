/**
 * The `@dphonys/nuxt-handler-errors/types` entry point: the public type
 * surface, and later the emitter's augmentation target.
 *
 * Every name below is public API for good, so the list is the names a consumer
 * has reason to *write*, not every name the package declares. The vocabulary a
 * definition is written *in* — the `Define*` hover-shorteners, the payload
 * machinery, the guards — is inferred at every call site rather than written
 * down, so it stays off this barrel and is reached by relative path inside
 * `dist`, which never consults the export map.
 */

export type {
  KnownError,
  KnownErrorGroup,
  KnownErrorsOf,
  KnownVariant,
  VariantsOf,
} from './known-error'

export type { CheckedEventHandler, Fail, KnownErrorsOfHandler } from './handler'

export type { Fallback, KnownErrorCarrier } from './matcher'

export type { KnownErrorBody, KnownErrorKey } from '../shared/wire'
