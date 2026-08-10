/**
 * The `@dphonys/nuxt-handler-errors/shared` entry point: the runtime values
 * that are genuinely side-agnostic, importable from the client, the server and
 * a consumer's `shared/` directory alike. Nothing reachable from here imports
 * `vue`, `h3` or `#app`.
 */

export { KNOWN_ERROR_KEY } from './wire'
