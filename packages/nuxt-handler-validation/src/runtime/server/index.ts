/**
 * The runnable core, and the explicit-import door for everywhere auto-imports
 * do not reach (Nitro plugins and tasks, tests, non-Nuxt Nitro consumers).
 *
 * **No `@nuxt/kit` runtime may be reachable from here.** It is a locked
 * constraint of the aggregator seam, guarded by `test/unit/core-layering.test.ts`
 * rather than by convention.
 *
 * `defineValidatedEventHandler`, `defineValidation` and
 * `recognizeValidationError` land here as they are built. Until the first one
 * does, the entry carries only the vocabulary the failure shape is named in -
 * enough for the published subpath, and everything that resolves through it,
 * to be wired and proven from day one.
 */

export type { ValidationSource } from '../types'
