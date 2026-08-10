/**
 * The `@dphonys/nuxt-handler-errors/shared` entry point: the runtime values
 * that are genuinely side-agnostic, importable from the client, the server and
 * a consumer's `shared/` directory alike. Nothing reachable from here imports
 * `h3` or `#app`; the one `vue` import is `unref`, a pure function that creates
 * no reactivity and is present on both runtimes of any Nuxt app.
 */

export { matchError } from './match-error'
export { KNOWN_ERROR_KEY } from './wire'
