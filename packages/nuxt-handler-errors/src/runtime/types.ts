/**
 * The `@dphonys/nuxt-handler-errors/types` entry point.
 *
 * This is the emitter's augmentation target *and* the whole public type surface
 * (SPEC.md §3). It has to be a real module rather than an ambient declaration
 * file: a non-exported `declare const … : unique symbol` does not survive
 * declaration emit from a published entry point (SPEC.md §8.2).
 *
 * `DeclaredErrorsOf`, `ErrorCatalogue`, `VariantsOf`, `Payload`,
 * `DeclaredErrorBody` and `TypedEventHandler` land here as later tickets add
 * them. Anything exported from here is public API for good (SPEC.md §8.1).
 */

/**
 * The generated route → declared-errors map, keyed exactly like Nitro's
 * `InternalApi`. The build-time emitter reopens this interface with
 * `declare module '@dphonys/nuxt-handler-errors/types'`; empty means no handler
 * has declared anything yet (SPEC.md §4.2).
 */
export interface TypedApiErrors {}
