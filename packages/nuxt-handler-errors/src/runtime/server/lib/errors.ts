import type { StandardSchemaV1 } from '@standard-schema/spec'
import { defineEventHandler } from 'h3'
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import { z } from 'zod'
import { isPlainObject } from '../../shared/plain-object'
import { functionSchema, isString } from '../../shared/primitives'
import type { CheckedEventHandler, CheckedHandlerFn } from '../../types/handler'
import type {
  AnyKnownError,
  ConflictGuard,
  Defs,
  FactoryInput,
  InputOfDef,
  InputsOfDefs,
  KnownError,
  KnownErrorGroup,
  KnownErrorsOf,
  KnownVariant,
  ValidDef,
  ValidDefs,
  ValidTag,
  VariantDef,
  VariantOfDef,
  VariantsOf,
} from '../../types/known-error'
import type { DeclaredError } from './declared'
import { knownErrorValue, resolveDeclared } from './declared'
import type { ErrorContext } from './error-context'
import { createErrorContext } from './error-context'

// Record keys are unique, so a group never holds two entries for one tag.
function buildGroup(
  entries: readonly DeclaredError[]
): KnownErrorGroup<KnownVariant, FactoryInput> {
  const group = Object.assign(entries.map(knownErrorValue), {
    pick: (...tags: readonly string[]) =>
      buildGroup(entries.filter((entry) => tags.includes(entry.tag))),
  })

  // SAFETY: `pick` narrows only the phantom variant union by tag; every
  // element of the subset is one of these same declaration-backed values, so
  // the runtime group inhabits whichever subset type its tags select. The
  // brand has no runtime witness, so nothing else can carry it across.
  return group as KnownErrorGroup<KnownVariant, FactoryInput>
}

/**
 * Declare one expected failure, or several at once: a tag and a definition
 * give back a single value, a definition record a spreadable group.
 *
 * ```ts
 * const forbidden = defineError('forbidden', { status: 403 })
 *
 * const userErrors = defineError({
 *   'user-not-found': { status: 404, payload: z.object({ userId: z.string() }) },
 *   'user-suspended': { status: 403, payload: z.object({ until: z.string() }) },
 * })
 * ```
 */
export function defineError<Tag extends string, const D extends VariantDef>(
  tag: Tag & ValidTag<Tag>,
  def: ValidDef<D> & D
): KnownError<VariantOfDef<Tag, D>, InputOfDef<Tag, D>>
export function defineError<const D extends Defs>(
  defs: ValidDefs<D> & D
): KnownErrorGroup<VariantsOf<D>, InputsOfDefs<D>>
// The overloads carry the literal definitions into the phantom brand only;
// at runtime the single form returns the value and the record form the group
// that this one implementation builds.
export function defineError(
  tagOrDefs: string | Defs,
  def?: VariantDef
): AnyKnownError | KnownErrorGroup<KnownVariant, FactoryInput> {
  if (isString(tagOrDefs)) {
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
}

// Mirrors the `IsTag` type: kebab-case, each `-` followed by a letter.
const TAG = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/

// A Standard Schema's host may be an object or a callable; either way the
// only member consulted is `validate`.
const standardHostSchema = z.union([z.looseObject({}), functionSchema])

type StandardHost = z.infer<typeof standardHostSchema>

const standardSchema = z.object({ validate: functionSchema })

function isStandardSchema(
  host: StandardHost
): host is StandardHost & StandardSchemaV1 {
  return (
    '~standard' in host && standardSchema.safeParse(host['~standard']).success
  )
}

// The compile-time guards' answer for a JavaScript caller, kept to what a
// typo would produce: a bad tag, a non-error status, a misspelt key, or a
// payload that is not a Standard Schema. Strict, so an unknown key is a
// rejection.
const definitionSchema = z.strictObject({
  status: z.number().int().min(400).max(599),
  payload: standardHostSchema.optional(),
})

type Definition = z.infer<typeof definitionSchema>

// A guard over the caller's own object, not zod's copy: the schema instance
// must reach the declaration untouched, prototype and identity included.
function isDefinition(
  def: VariantDef | undefined
): def is VariantDef & Definition {
  return definitionSchema.safeParse(def).success
}

function declaration(tag: string, def: VariantDef | undefined): DeclaredError {
  if (!TAG.test(tag)) {
    throw new TypeError(
      `[nuxt-handler-errors] error tag must be kebab-case, such as user-not-found: ${tag}`
    )
  }
  if (!isDefinition(def)) {
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
 *   { errors: [defineError('not-found', { status: 404 })] },
 *   async (event, { errors }) => {
 *     const userId = event.context.params?.id ?? ''
 *     const user = await lookup(userId)
 *     if (!user) throw errors.notFound()
 *     return user
 *   }
 * )
 * ```
 */
export function defineCheckedEventHandler<
  const A extends ReadonlyArray<AnyKnownError>,
  Response extends EventHandlerResponse,
  Request extends EventHandlerRequest = EventHandlerRequest,
>(
  options: ConflictGuard<A> & { errors: A },
  handler: CheckedHandlerFn<Request, Response, A>
): CheckedEventHandler<Request, Response, KnownErrorsOf<A>>
// The implementation signature takes the context as the runtime builds it:
// factories keyed by tag, each accepting whatever its declaration validates.
// Every overload's `HandlerContext<A>` is one such object with its keys and
// arities named.
export function defineCheckedEventHandler(
  options: { errors: readonly AnyKnownError[] },
  handler: (event: H3Event, context: ErrorContext) => EventHandlerResponse
): EventHandler {
  const context = createErrorContext(resolveDeclared(options.errors))

  // `async` so a synchronous throw surfaces as a rejection, the same as an
  // async body's. No cast on the way out: the brand is an optional property,
  // so a plain `EventHandler` already inhabits `CheckedEventHandler`.
  return defineEventHandler(async (event) => handler(event, context))
}
