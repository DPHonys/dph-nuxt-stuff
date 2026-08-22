import { defineEventHandler } from 'h3'
import type {
  DefineCheckedEventHandler,
  DefineError,
  DefinePayload,
} from '../../types/handler'
import type {
  Defs,
  KnownErrorGroup,
  KnownVariant,
  VariantDef,
} from '../../types/known-error'
import type { DeclaredError } from './declared'
import {
  byDistinctTag,
  createFail,
  knownErrorValue,
  resolveDeclared,
} from './declared'

/**
 * Marks a variant's payload type: `payload<{ userId: string }>()`. The
 * runtime value is inert - only the type argument matters, checked against
 * what survives JSON serialization. A Standard Schema may sit in the same
 * position instead.
 */
export const payload: DefinePayload = () => ({})

function buildGroup(
  entries: readonly DeclaredError[]
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
  const declared = resolveDeclared(options.errors)
  const fail = createFail(declared)

  // No cast on the way out: the brand is an optional property, so a plain
  // `EventHandler` already inhabits `CheckedEventHandler`.
  return defineEventHandler((event) => handler(event, { fail } as never))
}
