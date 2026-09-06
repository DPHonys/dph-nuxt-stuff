import type { StandardSchemaV1 } from '@standard-schema/spec'
import { defineEventHandler } from 'h3'
import type { EventHandlerRequest, H3Event } from 'h3'
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
import { byDistinctTag, knownErrorValue, resolveDeclared } from './declared'
import { createErrorContext, finalizeError } from './error-context'

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
    return knownErrorValue(declaration(tagOrDefs, def as VariantDef))
  }

  if (
    !tagOrDefs ||
    typeof tagOrDefs !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(tagOrDefs))
  ) {
    throw new TypeError('[nuxt-handler-errors] invalid error definitions')
  }
  return buildGroup(
    Reflect.ownKeys(tagOrDefs).map((tag) => {
      const entry = Object.getOwnPropertyDescriptor(tagOrDefs, tag)!
      if (
        typeof tag !== 'string' ||
        !entry.enumerable ||
        !Object.hasOwn(entry, 'value')
      ) {
        throw new TypeError('[nuxt-handler-errors] invalid error definition')
      }
      return declaration(tag, entry.value)
    })
  )
}) as DefineError

function declaration(tag: string, def: VariantDef): DeclaredError {
  if (
    !def ||
    typeof def !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(def)) ||
    Reflect.ownKeys(def).some(
      (key) =>
        (key !== 'status' && key !== 'payload') ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(def, key)!, 'value')
    ) ||
    !Object.hasOwn(def, 'status') ||
    !Number.isInteger(def.status) ||
    def.status < 400 ||
    def.status > 599
  ) {
    throw new TypeError('[nuxt-handler-errors] invalid error definition')
  }
  const slot = def.payload
  if (
    Object.hasOwn(def, 'payload') &&
    (slot === null ||
      (typeof slot !== 'object' &&
        !(typeof slot === 'function' && '~standard' in slot)))
  ) {
    throw new TypeError(`[nuxt-handler-errors] invalid payload for ${tag}`)
  }
  const schema =
    slot && '~standard' in slot ? (slot as StandardSchemaV1) : undefined
  if (
    schema &&
    (schema['~standard']?.version !== 1 ||
      typeof schema['~standard'].vendor !== 'string' ||
      typeof schema['~standard'].validate !== 'function')
  ) {
    throw new TypeError(
      `[nuxt-handler-errors] invalid Standard Schema for ${tag}`
    )
  }
  return {
    tag,
    status: def.status,
    hasPayload: Object.hasOwn(def, 'payload'),
    schema,
  }
}

/**
 * Declare handler-local error factories. The returned handler is an ordinary
 * h3 `EventHandler`; thrown factory errors are validated before escaping it.
 *
 * ```ts
 * export default defineCheckedEventHandler(
 *   { errors: [defineError('notFound', { status: 404 })] },
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
  options: { errors: readonly AnyKnownError[] },
  handler: (event: H3Event<EventHandlerRequest>, context: never) => any
) => {
  const context = createErrorContext(resolveDeclared(options.errors))

  // No cast on the way out: the brand is an optional property, so a plain
  // `EventHandler` already inhabits `CheckedEventHandler`.
  return defineEventHandler<EventHandlerRequest, any>(async (event) => {
    try {
      return await handler(event, context as never)
    } catch (error) {
      return finalizeError(error)
    }
  })
}
