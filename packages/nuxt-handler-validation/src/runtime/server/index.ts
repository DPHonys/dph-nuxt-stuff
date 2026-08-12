/**
 * The runnable core, and the explicit-import door for everywhere auto-imports
 * do not reach (Nitro plugins and tasks, tests, non-Nuxt Nitro consumers).
 *
 * **No `@nuxt/kit` runtime may be reachable from here.** It is a locked
 * constraint of the aggregator seam, guarded by `test/unit/core-layering.test.ts`
 * rather than by convention.
 */

export {
  defineValidatedEventHandler,
  defineValidation,
} from './lib/validated-handler'
