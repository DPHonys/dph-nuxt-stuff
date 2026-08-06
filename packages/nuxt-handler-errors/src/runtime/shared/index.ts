/**
 * The `@dphonys/nuxt-handler-errors/shared` entry point: side-agnostic runtime
 * values, importable from the client, the server and a consumer's `shared/`
 * directory. The hand-writable specifier is the contract; auto-imports are
 * sugar.
 *
 * This directory is "side-agnostic", not "published" — `./typed-fetch` lives
 * here for the same reason (nothing in it imports `#app`, which is what lets
 * one value be installed as a global on both sides) but is reached through
 * `globalThis.$typedFetch`, never through this specifier. What the list below
 * names is the whole public surface.
 */

export { defineErrors, defineTypedEventHandler, payload } from './errors'
export { declaredError, useDeclaredError } from './reader'
export { DECLARED_ERROR_KEY } from './wire'
