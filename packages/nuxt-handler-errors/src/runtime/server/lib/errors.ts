/**
 * The raise path: declaring a catalogue, and declaring the handler that draws
 * from one. The two stay in one file because they share `INTERNALS` — a
 * *module-private* symbol, which is what keeps the catalogue's runtime view
 * out of public API. Splitting them would demote it to an export.
 *
 * The only file in the package importing `h3`, and the reason this directory
 * rather than `../../shared`: `defineTypedEventHandler` calls h3's
 * `defineEventHandler`, so it is server-only by construction, and `INTERNALS`
 * welds `defineErrors` to it. Nothing client-side reads a catalogue — a
 * route's declared union reaches the client through the generated map, which
 * is derived from the *handler's* type, never from the catalogue value.
 */

import { createError, defineEventHandler } from 'h3'
import { DECLARED_ERROR_KEY } from '../../shared/wire'
// Reached by module rather than through `../../types`: the vocabulary a
// catalogue is *built* from is not what a consumer writes, so it stays off the
// published barrel and is imported where it is declared.
import type {
  AnyCatalogue,
  AnyVariant,
  ErrorCatalogue,
  VariantDef,
} from '../../types/catalogue'
import type {
  DefineErrors,
  DefinePayload,
  DefineTypedEventHandler,
} from '../../types/handler'

/**
 * Marks a variant's payload type. The runtime value is inert — only the type
 * argument matters, and it is checked against what survives JSON
 * serialization (see `SerializablePayload`).
 */
export const payload: DefinePayload = () => ({})

// ---------------------------------------------------------------------------
// Raising
// ---------------------------------------------------------------------------

/**
 * The one error-creation call at the raise site; nothing intercepts it.
 * `message` and `statusMessage` are both the tag (Nitro substitutes
 * `"Server Error"` for an unset `statusMessage`); `fatal`/`unhandled` are
 * left alone, so the production serializer keeps `data` and Nuxt never
 * escalates a declared failure; the marker's `status` copy is authoritative
 * (h3 rewrites an out-of-range HTTP status). The reserved names are spread
 * **last** so a payload field cannot displace them.
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
 * status. Deliberately not part of `ErrorCatalogue`: the symbol is
 * module-private, so it never becomes public API.
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
 * `errors: [...]` was handed a catalogue a second physical copy of this
 * module created (`INTERNALS` is per module *instance*). Throwing at module
 * evaluation is the point — skipping the entry instead hides the
 * misconfiguration until some request raises one of its tags, which then
 * falsely reports as "undeclared" and reaches the client as a 500. A
 * `Symbol.for()` registry would make copies interoperate and is deliberately
 * not used: the `h3` augmentation does not survive a second copy, so quietly
 * working catalogues would conceal a state this file cannot fix.
 */
function raiseForeignCatalogue(index: number): never {
  throw new Error(
    `[nuxt-handler-errors] errors[${index}] is not a catalogue created by this copy of the module. ` +
      `Either it did not come from defineErrors(), or there are two copies of ` +
      `@dphonys/nuxt-handler-errors in the dependency tree — a version duplicate, or a Nuxt ` +
      `layer or package that resolved its own. Deduplicate it so every catalogue and every ` +
      `handler come from one copy.`
  )
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
  } as unknown as ErrorCatalogue<E>
}

/**
 * The first catalogue in scope that declares this tag **and** still lists it
 * after `.pick()`, or `undefined`. First rather than last, so composition
 * order decides — the duplicate-tag guard already makes divergent duplicates
 * a compile error, so the choice only ever falls between identical members.
 */
function findVariant(
  catalogues: readonly CatalogueInternals[],
  tag: string
): VariantDef | undefined {
  for (const internals of catalogues) {
    const def = internals.defs[tag]
    if (def !== undefined && internals.tags.includes(tag)) return def
  }

  return undefined
}

/**
 * Resolve a tag against the catalogues in scope and raise it. The
 * unknown-tag throw exists for JavaScript callers only, and is a plain
 * `Error` on purpose: a programming mistake must not arrive at a client
 * wearing the marker.
 */
function raiseFrom(
  catalogues: readonly CatalogueInternals[],
  tag: string,
  fields: Record<string, unknown> | undefined
): never {
  const def = findVariant(catalogues, tag)

  if (def === undefined) {
    throw new Error(`[nuxt-handler-errors] undeclared error tag: ${tag}`)
  }

  raiseDeclared(tag, def.status, fields ?? {})
}

/**
 * Declare a reusable set of expected failures as a plain object literal of
 * variants. Status is inline per variant with no default; literal types
 * survive all the way to the client. Location-agnostic — the union travels
 * via the brand — with `shared/` as the documented default.
 */
export const defineErrors: DefineErrors = (defs) =>
  buildCatalogue(defs, Object.keys(defs))

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

/**
 * Declare the failures a route can produce, and get a `fail` scoped to
 * exactly those. The returned handler is an ordinary h3 `EventHandler` with
 * one optional phantom property, and the success type still infers from the
 * body because `fail` returns `never`.
 *
 * The catalogues are resolved **here**, at declaration, not lazily inside
 * `fail` — that is what makes {@link raiseForeignCatalogue} fire before the
 * route serves a request rather than on whichever one first raises.
 */
export const defineTypedEventHandler: DefineTypedEventHandler = (
  options,
  handler
) => {
  const catalogues: readonly AnyCatalogue[] = options.errors
  const internals = catalogues.map(
    (catalogue, index) => internalsOf(catalogue) ?? raiseForeignCatalogue(index)
  )

  const fail = (tag: string, fields?: Record<string, unknown>): never =>
    raiseFrom(internals, tag, fields)

  // No cast on the way out: the brand is an *optional* property, so a plain
  // `EventHandler` already inhabits `TypedEventHandler`.
  return defineEventHandler((event) => handler(event, { fail } as never))
}
