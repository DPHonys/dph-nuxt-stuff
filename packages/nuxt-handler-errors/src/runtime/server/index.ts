/**
 * The `@dphonys/nuxt-handler-errors/server` entry point: the definition
 * surface plus the observability recognizer, importable from a route file,
 * `server/utils/`, a Nitro plugin and anywhere else in the Nitro build.
 *
 * Server-only, and forced to be: `defineCheckedEventHandler` calls h3's
 * `defineEventHandler`, and `defineError` shares a module-private symbol with
 * it. Nothing here is reachable from the client, which costs nothing — an
 * error value has no client-side role. Its union travels to the call site
 * through the generated map, keyed by route path, and the value itself never
 * crosses.
 */

export { defineCheckedEventHandler, defineError, payload } from './lib/errors'
export { recognizeKnownError } from './lib/recognize-known-error'
