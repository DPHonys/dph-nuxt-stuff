/**
 * The definition surface and the raise path. The two stay in one file because
 * they share `INTERNALS` — a *module-private* symbol, which is what keeps an
 * error's runtime view out of public API. Splitting them would demote it to an
 * export.
 *
 * The only file in the package importing `h3`, and the reason this directory
 * rather than `../../shared`: `defineCheckedEventHandler` calls h3's
 * `defineEventHandler`, so it is server-only by construction, and `INTERNALS`
 * welds `defineError` to it. Nothing client-side reads a definition — a
 * route's declared union reaches the client through the generated map, which
 * is derived from the *handler's* type, never from the values. Consumers are
 * still free to keep their definitions in a `shared/` file; the values travel,
 * and no registry exists.
 */

import { createError, defineEventHandler } from 'h3'
import { knownErrorMarker } from '../../shared/wire'
import type { KnownRaiseInput } from '../../shared/wire'
import type {
  DefineCheckedEventHandler,
  DefineError,
  DefinePayload,
} from '../../types/handler'
// Reached by module rather than through `../../types`: the vocabulary a
// definition is *written in* is not what a consumer writes down, so it stays
// off the published barrel and is imported where it is declared.
import type {
  AnyKnownError,
  Defs,
  KnownErrorGroup,
  KnownVariant,
  VariantDef,
} from '../../types/known-error'

/**
 * Marks a variant's payload type. The runtime value is inert — only the type
 * argument matters, and it is checked against what survives JSON
 * serialization. A Standard Schema may sit in the same position instead; it is
 * read for its inferred output type and never executed.
 */
export const payload: DefinePayload = () => ({})

// ---------------------------------------------------------------------------
// Raising
// ---------------------------------------------------------------------------

/**
 * The one error-creation call at the raise site; nothing intercepts it.
 * `message` is the tag and `statusMessage` is never set — the reason phrase
 * survives an escaped server-to-server throw untouched, so the tag must not
 * ride it. `fatal`/`unhandled` are left alone, so the production serializer
 * keeps `data` and Nuxt never escalates a known failure to the error page.
 */
function raiseKnown(
  tag: string,
  status: number,
  fields: Record<string, unknown>
): never {
  const input: KnownRaiseInput<KnownVariant> = {
    statusCode: status,
    message: tag,
    data: knownErrorMarker(tag, status, fields),
  }

  throw createError(input)
}

// ---------------------------------------------------------------------------
// Error values
// ---------------------------------------------------------------------------

/**
 * The runtime view of one error value — what `fail` reads to resolve a tag's
 * status. Deliberately not part of `KnownError`: the symbol is module-private,
 * so it never becomes public API.
 */
interface KnownErrorInternals {
  readonly tag: string
  readonly status: number
}

const INTERNALS: unique symbol = Symbol('nuxt-handler-errors:internals')

function internalsOf(error: AnyKnownError): KnownErrorInternals | undefined {
  return (error as { [INTERNALS]?: KnownErrorInternals })[INTERNALS]
}

// Cast because the runtime object carries no `[VARIANT]` property: that brand
// is phantom and exists only in the type.
function knownErrorValue(internals: KnownErrorInternals): AnyKnownError {
  return { [INTERNALS]: internals } as unknown as AnyKnownError
}

/**
 * `errors: [...]` was handed a value a second physical copy of this module
 * created (`INTERNALS` is per module *instance*). Throwing at module
 * evaluation is the point — skipping the entry instead hides the
 * misconfiguration until some request raises one of its tags, which then
 * falsely reports as "undeclared" and reaches the client as a 500. A
 * `Symbol.for()` registry would make copies interoperate and is deliberately
 * not used: the `h3` augmentation does not survive a second copy, so quietly
 * working values would conceal a state this file cannot fix.
 */
function raiseForeignError(index: number): never {
  throw new Error(
    `[nuxt-handler-errors] errors[${index}] is not an error created by this copy of the module. ` +
      `Either it did not come from defineError(), or there are two copies of ` +
      `@dphonys/nuxt-handler-errors in the dependency tree — a version duplicate, or a Nuxt ` +
      `layer or package that resolved its own. Deduplicate it so every error and every ` +
      `handler come from one copy.`
  )
}

/**
 * One error per distinct tag, first occurrence winning. The type level already
 * makes a divergent redeclaration a compile error and lets an identical one
 * collapse, but JavaScript callers see no guard — so the rule is enforced
 * here, at every place a list is built.
 */
function byDistinctTag(
  entries: readonly KnownErrorInternals[]
): KnownErrorInternals[] {
  // A `Map`, not an object: `__proto__` is a legal tag.
  const distinct = new Map<string, KnownErrorInternals>()

  for (const entry of entries) {
    if (!distinct.has(entry.tag)) distinct.set(entry.tag, entry)
  }

  return [...distinct.values()]
}

/**
 * A group is an array of singles with `pick` alongside — so spread is the only
 * composition operator a consumer needs, and `pick` narrows the runtime list,
 * not only its type.
 */
function buildGroup(
  entries: readonly KnownErrorInternals[]
): KnownErrorGroup<KnownVariant> {
  const distinct = byDistinctTag(entries)

  return Object.assign(distinct.map(knownErrorValue), {
    pick: (...tags: readonly string[]) =>
      buildGroup(distinct.filter((entry) => tags.includes(entry.tag))),
  }) as unknown as KnownErrorGroup<KnownVariant>
}

/**
 * Declare one expected failure, or several at once. Arity separates the two
 * forms: a tag and a definition give back a single value, a definition record
 * gives back a spreadable group.
 */
export const defineError: DefineError = ((
  tagOrDefs: string | Defs,
  def?: VariantDef
): unknown => {
  if (typeof tagOrDefs === 'string') {
    return knownErrorValue({
      tag: tagOrDefs,
      status: (def as VariantDef).status,
    })
  }

  return buildGroup(
    Object.entries(tagOrDefs).map(([tag, entry]) => ({
      tag,
      status: entry.status,
    }))
  )
}) as DefineError

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

/**
 * Declare the failures a route can produce, and get a `fail` scoped to exactly
 * those. The returned handler is an ordinary h3 `EventHandler` with one
 * optional phantom property, and the success type still infers from the body
 * because `fail` returns `never`.
 *
 * The errors are resolved **here**, at declaration, not lazily inside `fail` —
 * that is what makes {@link raiseForeignError} fire before the route serves a
 * request rather than on whichever one first raises.
 */
export const defineCheckedEventHandler: DefineCheckedEventHandler = (
  options,
  handler
) => {
  const declared = byDistinctTag(
    options.errors.map(
      (error, index) => internalsOf(error) ?? raiseForeignError(index)
    )
  )

  const fail = (tag: string, fields?: Record<string, unknown>): never => {
    const internals = declared.find((entry) => entry.tag === tag)

    // For JavaScript callers only, and a plain `Error` on purpose: a
    // programming mistake must not arrive at a client wearing the marker that
    // means "the server declared this".
    if (internals === undefined) {
      throw new Error(`[nuxt-handler-errors] undeclared error tag: ${tag}`)
    }

    raiseKnown(internals.tag, internals.status, fields ?? {})
  }

  // No cast on the way out: the brand is an *optional* property, so a plain
  // `EventHandler` already inhabits `CheckedEventHandler`.
  return defineEventHandler((event) => handler(event, { fail } as never))
}
