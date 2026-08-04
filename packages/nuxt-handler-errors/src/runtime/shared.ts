/**
 * The `@dphonys/nuxt-handler-errors/shared` entry point.
 *
 * Side-agnostic runtime values, reachable by hand-written import from the
 * client, the server and a consumer's `shared/` directory (SPEC.md §3). The
 * hand-writable specifier is the contract; auto-imports are additive sugar on
 * top of it, never a substitute — the bare `.` specifier is import-protected by
 * Nuxt in every context, which is why these subpaths are mandatory.
 *
 * `defineErrors`, `payload`, `declaredError` and `invalidInput` land here as
 * later tickets add them.
 */

/**
 * The reserved key a declared failure travels under, inside the error body's
 * `data` (SPEC.md §5.2). Frozen wire protocol: it deliberately does not track
 * the package name, so renaming the package cannot silently break a client.
 */
export const DECLARED_ERROR_KEY = '__declaredError__'
