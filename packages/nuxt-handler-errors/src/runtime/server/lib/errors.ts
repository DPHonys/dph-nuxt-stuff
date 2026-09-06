import type { StandardSchemaV1 } from '@standard-schema/spec'
import { defineEventHandler } from 'h3'
import type { EventHandlerRequest, H3Event } from 'h3'
import type {
  DefineCheckedEventHandler,
  DefineError,
} from '../../types/handler'
import type {
  AnyKnownError,
  Defs,
  KnownErrorGroup,
  KnownVariant,
  VariantDef,
} from '../../types/known-error'
import type { DeclaredError } from './declared'
import { knownErrorValue, resolveDeclared } from './declared'
import { createErrorContext } from './error-context'

// Record keys are unique, so a group never holds two entries for one tag.
function buildGroup(
  entries: readonly DeclaredError[]
): KnownErrorGroup<KnownVariant> {
  return Object.assign(entries.map(knownErrorValue), {
    pick: (...tags: readonly string[]) =>
      buildGroup(entries.filter((entry) => tags.includes(entry.tag))),
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
 *   userNotFound: { status: 404, payload: z.object({ userId: z.string() }) },
 *   userSuspended: { status: 403, payload: z.object({ until: z.string() }) },
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
  if (!tagOrDefs || typeof tagOrDefs !== 'object' || Array.isArray(tagOrDefs)) {
    throw new TypeError('[nuxt-handler-errors] invalid error definitions')
  }
  return buildGroup(
    Object.entries(tagOrDefs).map(([tag, entry]) => declaration(tag, entry))
  )
}) as DefineError

// Mirrors the `ValidTag` type: ASCII letters, digits, `_` and `$`, so a tag
// is a factory property name.
const IDENTIFIER = /^[a-z_$][\w$]*$/i

// The compile-time guards' answer for a JavaScript caller, kept to what a
// typo would produce: a bad tag, a non-error status, a misspelt key, or a
// payload that is not a Standard Schema.
function declaration(tag: string, def: VariantDef): DeclaredError {
  if (!IDENTIFIER.test(tag)) {
    throw new TypeError(
      `[nuxt-handler-errors] error tag must be a valid identifier: ${tag}`
    )
  }
  if (
    !def ||
    typeof def !== 'object' ||
    !Number.isInteger(def.status) ||
    def.status < 400 ||
    def.status > 599 ||
    Object.keys(def).some((key) => key !== 'status' && key !== 'payload')
  ) {
    throw new TypeError('[nuxt-handler-errors] invalid error definition')
  }
  const schema = def.payload as StandardSchemaV1 | undefined
  if (
    schema !== undefined &&
    typeof schema?.['~standard']?.validate !== 'function'
  ) {
    throw new TypeError(
      `[nuxt-handler-errors] invalid Standard Schema for ${tag}`
    )
  }
  return { tag, status: def.status, schema }
}

/**
 * Declare handler-local error factories. The returned handler is an ordinary
 * h3 `EventHandler`; a factory's result is a finished `H3Error` to throw.
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

  // `async` so a synchronous throw surfaces as a rejection, the same as an
  // async body's. No cast on the way out: the brand is an optional property,
  // so a plain `EventHandler` already inhabits `CheckedEventHandler`.
  return defineEventHandler<EventHandlerRequest, any>(async (event) =>
    handler(event, context as never)
  )
}
