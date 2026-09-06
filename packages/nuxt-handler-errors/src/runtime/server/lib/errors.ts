import type { StandardSchemaV1 } from '@standard-schema/spec'
import { defineEventHandler } from 'h3'
import type { EventHandlerRequest, H3Event } from 'h3'
import * as v from 'valibot'
import { isPlainObject } from '../../shared/plain-object'
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
  const group = Object.assign(entries.map(knownErrorValue), {
    pick: (...tags: readonly string[]) =>
      buildGroup(entries.filter((entry) => tags.includes(entry.tag))),
  })

  // SAFETY: `pick` narrows only the phantom variant union by tag; every
  // element of the subset is one of these same declaration-backed values, so
  // the runtime group inhabits whichever subset type its tags select.
  return group as KnownErrorGroup<KnownVariant>
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
// SAFETY: the overloads carry the literal definitions into the phantom brand
// only; at runtime the single form returns the value and the record form the
// group that this one implementation builds.
export const defineError: DefineError = ((
  tagOrDefs: string | Defs,
  def?: VariantDef
): AnyKnownError | KnownErrorGroup<KnownVariant> => {
  if (v.is(v.string(), tagOrDefs)) {
    return knownErrorValue(declaration(tagOrDefs, def))
  }
  // The record form: a non-null, non-array object of definitions, each
  // validated on its own by `declaration`.
  if (!isPlainObject(tagOrDefs)) {
    throw new TypeError('[nuxt-handler-errors] invalid error definitions')
  }
  return buildGroup(
    Object.entries(tagOrDefs).map(([tag, entry]) => declaration(tag, entry))
  )
}) as DefineError

// Mirrors the `ValidTag` type: ASCII letters, digits, `_` and `$`, so a tag
// is a factory property name.
const IDENTIFIER = /^[a-z_$][\w$]*$/i

// A Standard Schema's host may be an object or a callable; either way the
// only member consulted is `validate`.
const standardHostSchema = v.union([
  v.record(v.string(), v.unknown()),
  v.function(),
])

type StandardHost = v.InferOutput<typeof standardHostSchema>

const standardSchema = v.object({ validate: v.function() })

function isStandardSchema(
  host: StandardHost
): host is StandardHost & StandardSchemaV1 {
  return (
    !Array.isArray(host) &&
    '~standard' in host &&
    v.is(standardSchema, host['~standard'])
  )
}

// The compile-time guards' answer for a JavaScript caller, kept to what a
// typo would produce: a non-error status, a misspelt key, or a payload that
// is not a Standard Schema. Strict, so an unknown key is a rejection.
const definitionSchema = v.strictObject({
  status: v.pipe(v.number(), v.integer(), v.minValue(400), v.maxValue(599)),
  payload: v.optional(standardHostSchema),
})

function declaration(tag: string, def: VariantDef | undefined): DeclaredError {
  if (!IDENTIFIER.test(tag)) {
    throw new TypeError(
      `[nuxt-handler-errors] error tag must be a valid identifier: ${tag}`
    )
  }
  if (!v.is(definitionSchema, def)) {
    throw new TypeError('[nuxt-handler-errors] invalid error definition')
  }
  if (def.payload !== undefined && !isStandardSchema(def.payload)) {
    throw new TypeError(
      `[nuxt-handler-errors] invalid Standard Schema for ${tag}`
    )
  }
  return { tag, status: def.status, schema: def.payload }
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
  // SAFETY: the overload's `HandlerContext<A>` is this same `{ errors }`
  // object with each factory typed by its declared payload; `never` is only
  // how the runtime signature stays assignable to every instantiation.
  return defineEventHandler<EventHandlerRequest, any>(async (event) =>
    handler(event, context as never)
  )
}
