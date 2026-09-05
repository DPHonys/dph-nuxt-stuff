import { defineEventHandler } from 'h3'
import type { EventHandlerRequest, H3Event } from 'h3'
import type { ErrorDefinitions } from '../../types/error-definitions'
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
import type { DeclaredError } from './declared'
import {
  byDistinctTag,
  createFail,
  knownErrorValue,
  resolveDeclared,
} from './declared'
import { createErrorContext, finalizeError } from './error-context'

/**
 * Marks a variant's payload type: `payload<{ userId: string }>()`. The
 * runtime value is inert - only the type argument matters, checked against
 * what survives JSON serialization. A Standard Schema may sit in the same
 * position instead.
 * @deprecated Use a Standard Schema in a handler-local definition's `data` slot.
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
 * @deprecated Use a handler-local errors definition record instead.
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
 * Declare handler-local error factories. The returned handler is an ordinary
 * h3 `EventHandler`; thrown factory errors are validated before escaping it.
 *
 * ```ts
 * export default defineCheckedEventHandler(
 *   { errors: { notFound: { status: 404 } } },
 *   async (event, { errors }) => {
 *     const userId = event.context.params?.id ?? ''
 *     const user = await lookup(userId)
 *     if (!user) throw errors.notFound()
 *     return user
 *   }
 * )
 * ```
 */
export const defineCheckedEventHandler: DefineCheckedEventHandler = (
  options: { errors: ErrorDefinitions | readonly AnyKnownError[] },
  handler: (event: H3Event<EventHandlerRequest>, context: never) => any
) => {
  if (Array.isArray(options.errors)) {
    const fail = createFail(resolveDeclared(options.errors))
    return defineEventHandler((event) => handler(event, { fail } as never))
  }
  const context = createErrorContext(options.errors as ErrorDefinitions)

  // No cast on the way out: the brand is an optional property, so a plain
  // `EventHandler` already inhabits `CheckedEventHandler`.
  return defineEventHandler(async (event) => {
    try {
      return await handler(event, context as never)
    } catch (error) {
      return finalizeError(error)
    }
  })
}
