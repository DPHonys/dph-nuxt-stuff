/**
 * The `@dphonys/nuxt-handler-errors/shared` entry point: the runtime values
 * that are genuinely side-agnostic, importable from the client, the server and
 * a consumer's `shared/` directory alike.
 *
 * "Side-agnostic" is now a claim about the import graph rather than a label:
 * nothing reachable from here imports `vue`, `h3` or `#app`. The declaration
 * surface moved to `../server` (it calls into h3) and the reactive reader to
 * `../app/composables/use-declared-error` (it calls into Vue), so each half of
 * the old barrel now sits with the dependency it actually carries.
 *
 * `./typed-fetch` lives in this directory for that same side-agnosticism — it
 * is what lets one value be installed as a global on both sides — but is
 * deliberately absent below: it reaches call sites as `globalThis.$typedFetch`,
 * never through this specifier. What the list names is the whole public
 * surface.
 */

export { declaredError } from './read-floor'
export { DECLARED_ERROR_KEY } from './wire'
