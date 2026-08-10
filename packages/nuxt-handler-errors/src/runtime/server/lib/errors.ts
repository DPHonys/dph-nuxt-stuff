import { createError, defineEventHandler } from 'h3'
import { knownErrorMarker } from '../../shared/wire'
import type { KnownRaiseInput } from '../../shared/wire'
import type {
  DefineCheckedEventHandler,
  DefineError,
  DefinePayload,
} from '../../types/handler'
import type {
  AnyKnownError,
  Defs,
  KnownErrorGroup,
  KnownVariant,
  VariantDef,
} from '../../types/known-error'

/**
 * Marks a variant's payload type: `payload<{ userId: string }>()`. The
 * runtime value is inert - only the type argument matters, checked against
 * what survives JSON serialization. A Standard Schema may sit in the same
 * position instead.
 */
export const payload: DefinePayload = () => ({})

// `statusMessage` is never set - the reason phrase survives an escaped
// server-to-server throw untouched, so the tag must not ride it.
// `fatal`/`unhandled` are left alone, so the production serializer keeps
// `data` and Nuxt never escalates a known failure to the error page.
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

interface KnownErrorInternals {
  readonly tag: string
  readonly status: number
}

const INTERNALS: unique symbol = Symbol('nuxt-handler-errors:internals')

function internalsOf(error: AnyKnownError): KnownErrorInternals | undefined {
  return (error as { [INTERNALS]?: KnownErrorInternals })[INTERNALS]
}

// Cast because the `[VARIANT]` brand is phantom and exists only in the type.
function knownErrorValue(internals: KnownErrorInternals): AnyKnownError {
  return { [INTERNALS]: internals } as unknown as AnyKnownError
}

// `INTERNALS` is per module instance, so a value from a second physical copy
// of this module fails here. Throwing at module evaluation is the point -
// skipping the entry would hide the misconfiguration until some request
// raises one of its tags.
function raiseForeignError(index: number): never {
  throw new Error(
    `[nuxt-handler-errors] errors[${index}] is not an error created by this copy of the module. ` +
      `Either it did not come from defineError(), or there are two copies of ` +
      `@dphonys/nuxt-handler-errors in the dependency tree - a version duplicate, or a Nuxt ` +
      `layer or package that resolved its own. Deduplicate it so every error and every ` +
      `handler come from one copy.`
  )
}

// One error per distinct tag, first occurrence winning - JavaScript callers
// see none of the type-level guards.
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

function buildGroup(
  entries: readonly KnownErrorInternals[]
): KnownErrorGroup<KnownVariant> {
  const distinct = byDistinctTag(entries)

  return Object.assign(distinct.map(knownErrorValue), {
    pick: (...tags: readonly string[]) =>
      buildGroup(distinct.filter((entry) => tags.includes(entry.tag))),
  }) as KnownErrorGroup<KnownVariant>
}

/**
 * Declare one expected failure, or several at once: a tag and a definition
 * give back a single value, a definition record a spreadable group.
 *
 * ```ts
 * const forbidden = defineError('forbidden', { status: 403 })
 *
 * const userErrors = defineError({
 *   'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
 *   'user-suspended': { status: 403, payload: payload<{ until: string }>() },
 * })
 * ```
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

/**
 * Declare the failures a route can produce, and get a `fail` scoped to
 * exactly those. The returned handler is an ordinary h3 `EventHandler`.
 *
 * ```ts
 * export default defineCheckedEventHandler(
 *   { errors: [...userErrors, forbidden] },
 *   async (event, { fail }) => {
 *     const userId = event.context.params?.id ?? ''
 *     const user = await lookup(userId)
 *     if (!user) return fail('user-not-found', { userId })
 *     return user
 *   }
 * )
 * ```
 */
export const defineCheckedEventHandler: DefineCheckedEventHandler = (
  options,
  handler
) => {
  // Resolved here, at declaration, not lazily inside `fail` - so a foreign
  // error fires before the route serves a request.
  const declared = byDistinctTag(
    options.errors.map(
      (error, index) => internalsOf(error) ?? raiseForeignError(index)
    )
  )

  const fail = (tag: string, fields?: Record<string, unknown>): never => {
    const internals = declared.find((entry) => entry.tag === tag)

    // A plain `Error` on purpose: a programming mistake must not arrive at a
    // client wearing the marker that means "the server declared this".
    if (internals === undefined) {
      throw new Error(`[nuxt-handler-errors] undeclared error tag: ${tag}`)
    }

    raiseKnown(internals.tag, internals.status, fields ?? {})
  }

  // No cast on the way out: the brand is an optional property, so a plain
  // `EventHandler` already inhabits `CheckedEventHandler`.
  return defineEventHandler((event) => handler(event, { fail } as never))
}
