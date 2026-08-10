/**
 * The `@dphonys/nuxt-handler-errors-old/server` entry point: the declaration
 * surface, importable from a route file, `server/utils/` and anywhere else in
 * the Nitro build.
 *
 * Server-only, and forced to be: `defineTypedEventHandler` calls h3's
 * `defineEventHandler`, and `defineErrors` shares a module-private symbol with
 * it. Nothing here is reachable from the client, which costs nothing — a
 * catalogue has no client-side role at either level. Its union travels to the
 * call site through the generated map, keyed by route path, and the value
 * itself never crosses.
 *
 * This directory also holds the two Nitro plugins and `event.$typedFetch`'s
 * implementation; neither is reachable through this specifier, because both
 * arrive by registration.
 */

export { defineErrors, defineTypedEventHandler, payload } from './lib/errors'
