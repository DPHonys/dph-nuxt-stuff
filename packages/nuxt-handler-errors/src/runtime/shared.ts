/**
 * The `@dphonys/nuxt-handler-errors/shared` entry point.
 *
 * Side-agnostic runtime values, reachable by hand-written import from the
 * client, the server and a consumer's `shared/` directory (SPEC.md §3). The
 * hand-writable specifier is the contract; auto-imports are additive sugar on
 * top of it, never a substitute — the bare `.` specifier is import-protected by
 * Nuxt in every context, which is why these subpaths are mandatory.
 *
 * `declaredError` and `invalidInput` land here as later tickets add them.
 */

import { createError, defineEventHandler } from 'h3'
import type {
  AnyCatalogue,
  AnyVariant,
  DefineErrors,
  DefinePayload,
  DefineTypedEventHandler,
  ErrorCatalogue,
  VariantDef,
} from './types'

/**
 * The reserved key a declared failure travels under, inside the error body's
 * `data` (SPEC.md §5.2). Frozen wire protocol: it deliberately does not track
 * the package name, so renaming the package cannot silently break a client.
 *
 * Its presence *is* the evidence that the server declared this failure, and its
 * value *is* the variant. Versioning is by key rename, which is a feature — an
 * old client sees a marker it does not recognise and falls back to the
 * undeclared channel, the conservative direction, with no negotiation policy to
 * write.
 */
export const DECLARED_ERROR_KEY = '__declaredError__'

/**
 * Marks a variant's payload type. The runtime value is inert — only the type
 * argument matters.
 *
 * The type argument is checked against what survives JSON serialization; see
 * `SerializablePayload` for why that is a correctness requirement rather than
 * hygiene.
 */
export const payload: DefinePayload = () => ({})

// ---------------------------------------------------------------------------
// Raising
// ---------------------------------------------------------------------------

/**
 * The one error-creation call at the raise site (SPEC.md §5.1). Nothing
 * intercepts it: no Nitro plugin, no error-handler override.
 *
 * Three details are load-bearing:
 *
 * - **`message` and `statusMessage` are both the tag.** Nitro substitutes
 *   `"Server Error"` for an unset `statusMessage`, so leaving it off makes every
 *   declared 403 report `Server Error` as its HTTP reason phrase. Tags are
 *   kebab-case ASCII, so h3's `sanitizeStatusMessage` leaves them alone.
 * - **`fatal` and `unhandled` are left alone**, so they stay `false` and the
 *   framework's existing "expected error" convention is adopted rather than
 *   replaced: the production serializer keeps `data`, and Nuxt never escalates
 *   a declared failure to the global error page.
 * - **The status is duplicated inside the marker, and that copy is
 *   authoritative.** h3 rewrites an out-of-range HTTP status to a default, so
 *   the two agree by construction rather than by hope (SPEC.md §5.3).
 *
 * The two reserved names are spread **last** so a payload field called `tag` or
 * `status` cannot displace them — which is what the type level already says,
 * since `{ tag: K } & P` intersects rather than overwrites.
 */
function raiseDeclared(
  tag: string,
  status: number,
  fields: Record<string, unknown>
): never {
  throw createError({
    statusCode: status,
    statusMessage: tag,
    message: tag,
    data: { [DECLARED_ERROR_KEY]: { ...fields, tag, status } },
  })
}

// ---------------------------------------------------------------------------
// Catalogues
// ---------------------------------------------------------------------------

/**
 * The runtime view of a catalogue — what `fail` reads to resolve a tag's
 * status.
 *
 * It is deliberately not part of `ErrorCatalogue`: the symbol is module-private,
 * so nothing outside this file can reach it and it never becomes public API
 * (SPEC.md §8.1).
 */
interface CatalogueInternals {
  readonly defs: Readonly<Record<string, VariantDef>>
  readonly tags: readonly string[]
}

const INTERNALS: unique symbol = Symbol('nuxt-handler-errors:catalogue')

function internalsOf(catalogue: AnyCatalogue): CatalogueInternals | undefined {
  return (catalogue as { [INTERNALS]?: CatalogueInternals })[INTERNALS]
}

/**
 * `pick` keeps the full `defs` and narrows only `tags`, so `tags` is what
 * enforces the narrowing at runtime — a picked catalogue that was asked for a
 * tag it dropped must not answer for it.
 */
function buildCatalogue<E extends AnyVariant>(
  defs: Readonly<Record<string, VariantDef>>,
  tags: readonly string[]
): ErrorCatalogue<E> {
  const internals: CatalogueInternals = { defs, tags }

  // Cast because the runtime object carries no `[ERRORS]` property: the brand
  // is phantom and exists only in the type.
  return {
    [INTERNALS]: internals,
    pick: (...picked: readonly string[]) =>
      buildCatalogue(
        defs,
        picked.filter((tag) => tags.includes(tag))
      ),
    raise: (tag: string, fields?: Record<string, unknown>) =>
      raiseFrom([internals], tag, fields),
  } as unknown as ErrorCatalogue<E>
}

/**
 * Resolve a tag against the catalogues in scope and raise it.
 *
 * The unknown-tag throw is unreachable through the typed surface — both `fail`
 * and `.raise` are scoped to the declared union — so it exists for JavaScript
 * callers and for `.raise`'s unenforced escape hatch, and it is a plain `Error`
 * on purpose: it is a programming mistake, not a declared failure, and must not
 * arrive at a client wearing the marker.
 */
function raiseFrom(
  catalogues: readonly CatalogueInternals[],
  tag: string,
  fields: Record<string, unknown> | undefined
): never {
  for (const internals of catalogues) {
    const def = internals.defs[tag]
    if (def !== undefined && internals.tags.includes(tag)) {
      raiseDeclared(tag, def.status, fields ?? {})
    }
  }

  throw new Error(`[nuxt-handler-errors] undeclared error tag: ${tag}`)
}

/**
 * Declare a route's expected failures once, as a plain object literal of
 * variants (SPEC.md §3.2).
 *
 * Status is inline per variant and has no default. Literal types survive: a
 * status written as `404` stays `404`, and a payload union stays that union,
 * all the way through to the client.
 *
 * Location-agnostic — the module never looks at where a catalogue lives,
 * because the union travels via the brand. `shared/` is the documented default
 * only because a `server/`-only catalogue cannot later be used as a runtime
 * value on the client without a file move that touches every import.
 */
export const defineErrors: DefineErrors = (defs) =>
  buildCatalogue(defs, Object.keys(defs))

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

/**
 * Declare the failures a route can produce, and get a `fail` scoped to exactly
 * those (SPEC.md §3.1).
 *
 * The returned handler is an ordinary h3 `EventHandler` with one optional
 * phantom property added, so Nitro, the router and every h3 utility keep
 * treating the route as ordinary — and the success type still infers from the
 * body with no annotation, because `fail` returns `never`.
 */
export const defineTypedEventHandler: DefineTypedEventHandler = (
  options,
  handler
) => {
  const catalogues: readonly AnyCatalogue[] = options.errors
  const internals = catalogues
    .map((catalogue) => internalsOf(catalogue))
    .filter((entry) => entry !== undefined)

  const fail = (tag: string, fields?: Record<string, unknown>): never =>
    raiseFrom(internals, tag, fields)

  // No cast on the way out: the brand is an *optional* property, so a plain
  // `EventHandler` already inhabits `TypedEventHandler` (SPEC.md §4.1).
  return defineEventHandler((event) => handler(event, { fail: fail as never }))
}
