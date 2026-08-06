/**
 * The `@dphonys/nuxt-handler-errors/shared` entry point: side-agnostic
 * runtime values, importable from the client, the server and a consumer's
 * `shared/` directory. The hand-writable specifier is the contract;
 * auto-imports are sugar. The `vue` import stays a plain caret-ranged
 * dependency for instance identity: two physical copies of Vue are two
 * reactivity systems, and a `computed` from one does not track a ref owned by
 * the other.
 */

import { createError, defineEventHandler } from 'h3'
import { computed } from 'vue'
import type { Ref } from 'vue'
import type {
  AnyCatalogue,
  AnyVariant,
  DeclaredErrorReader,
  DefineErrors,
  DefinePayload,
  DefineTypedEventHandler,
  ErrorCatalogue,
  UseDeclaredError,
  VariantDef,
} from './types'

/**
 * The reserved key a declared failure travels under, inside the error body's
 * `data`. Frozen wire protocol: its presence *is* the evidence the server
 * declared this failure, its value *is* the variant, and versioning is by key
 * rename. Deliberately does not track the package name.
 */
export const DECLARED_ERROR_KEY = '__declaredError__'

/**
 * Marks a variant's payload type. The runtime value is inert — only the type
 * argument matters, and it is checked against what survives JSON
 * serialization (see `SerializablePayload`).
 */
export const payload: DefinePayload = () => ({})

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The guard, and the whole of the wire's shape floor. Presence of the marker
 * is not enough — the floor (string `tag`, number `status`) is checked too,
 * so a present-but-malformed marker reads as *undeclared*, the direction
 * every consumer already handles. `typeof`-based deliberately: it rejects a
 * function carrying the two properties, and the explicit `!== null` stops
 * `typeof null === 'object'` from reaching the property reads.
 */
function readFloor(error: unknown): AnyVariant | undefined {
  const marker = (
    error as { data?: { data?: Record<string, unknown> } } | null | undefined
  )?.data?.data?.[DECLARED_ERROR_KEY]

  return typeof marker === 'object' &&
    marker !== null &&
    typeof (marker as AnyVariant).tag === 'string' &&
    typeof (marker as AnyVariant).status === 'number'
    ? (marker as AnyVariant)
    : undefined
}

/**
 * Read the declared variant out of an error value, or `undefined` — "not a
 * declared failure" — if there is not one. Overloads, `undefined`'s meaning
 * and deploy skew are documented on {@link DeclaredErrorReader}.
 *
 * The assertion is to the interface itself rather than through `never`: the
 * implementation is still checked for comparability, so a `readFloor` that
 * stopped answering the floor would fail here. `as never` would not.
 */
export const declaredError: DeclaredErrorReader =
  readFloor as DeclaredErrorReader

/**
 * The reactive sibling of {@link declaredError}, for templates. Narrow on a
 * local `const current = failure.value` — see {@link UseDeclaredError} for
 * why that is not a style preference.
 */
export const useDeclaredError: UseDeclaredError = ((error: Ref<unknown>) =>
  computed(() => readFloor(error.value))) as UseDeclaredError

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
