import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import { createError } from 'h3'
import { knownErrorMarker } from '../../shared/wire'
import type { KnownRaiseInput } from '../../shared/wire'
import type {
  AnyKnownError,
  KnownVariant,
  VARIANT,
} from '../../types/known-error'

/** What a `defineError` value resolves to once declared on a handler. */
export interface DeclaredError {
  readonly tag: string
  readonly status: number
  readonly schema: StandardSchemaV1 | undefined
}

// One class per module instance on purpose - a value from a second physical
// copy of this module fails `instanceof`, so `internalsOf` rejects it.
class KnownErrorValue implements AnyKnownError {
  // Phantom: the brand exists only in the type. `declare` emits nothing, so
  // the runtime object carries the declaration and nothing else.
  declare readonly [VARIANT]: AnyKnownError[typeof VARIANT]

  constructor(readonly declared: DeclaredError) {}
}

export function internalsOf(error: AnyKnownError): DeclaredError | undefined {
  return error instanceof KnownErrorValue ? error.declared : undefined
}

export function knownErrorValue(internals: DeclaredError): AnyKnownError {
  return new KnownErrorValue(internals)
}

// Throwing at module evaluation is the point - skipping the entry would hide
// the misconfiguration until some request raises one of its tags.
function raiseForeignError(index: number): never {
  throw new Error(
    `[nuxt-handler-errors] errors[${index}] is not an error created by this copy of the module. ` +
      `Either it did not come from defineError(), or there are two copies of ` +
      `@dphonys/nuxt-handler-errors in the dependency tree - a version duplicate, or a Nuxt ` +
      `layer or package that resolved its own. Deduplicate it so every error and every ` +
      `handler come from one copy.`
  )
}

// Identical declarations dedupe; different validators must never silently win.
function byDistinctTag(entries: readonly DeclaredError[]): DeclaredError[] {
  // A `Map`, not an object: `__proto__` is a legal tag.
  const distinct = new Map<string, DeclaredError>()

  for (const entry of entries) {
    const previous = distinct.get(entry.tag)
    if (
      previous &&
      (previous.status !== entry.status || previous.schema !== entry.schema)
    ) {
      throw new TypeError(
        `[nuxt-handler-errors] conflicting declarations for ${entry.tag}`
      )
    }
    if (!previous) distinct.set(entry.tag, entry)
  }

  return [...distinct.values()]
}

// At declaration, not lazily inside a factory - so a foreign error fires before
// the route serves a request.
export function resolveDeclared(
  errors: readonly AnyKnownError[]
): DeclaredError[] {
  return byDistinctTag(
    errors.map((error, index) => internalsOf(error) ?? raiseForeignError(index))
  )
}

// `statusMessage` is never set - the reason phrase survives an escaped
// server-to-server throw untouched, so the tag must not ride it.
// `fatal`/`unhandled` are left alone, so the production serializer keeps
// `data` and Nuxt never escalates a known failure to the error page.
// Generic over the payload: the fields are whatever the caller's schema
// produced, and nothing here reads them.
export function createKnownError<Fields extends Record<string, unknown>>(
  tag: string,
  status: number,
  fields: Fields
): H3Error {
  const input: KnownRaiseInput<KnownVariant> = {
    statusCode: status,
    message: tag,
    data: knownErrorMarker(tag, status, fields),
  }

  return createError(input)
}
