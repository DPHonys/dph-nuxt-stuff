import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import { createError } from 'h3'
import type { DeclaredError } from './declared'
import { byDistinctTag, createKnownError } from './declared'

type Validation =
  | { result: StandardSchemaV1.Result<unknown> }
  | { exception: unknown }

// No discoverable symbol or writable property can forge deferred validation.
const pending = new WeakMap<
  object,
  { stack: string | undefined; finalize: () => Promise<H3Error> }
>()

function validatedError(
  tag: string,
  status: number,
  result: StandardSchemaV1.Result<unknown>
): H3Error {
  if (!result.issues) {
    try {
      const value = result.value
      if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        'toJSON' in value ||
        'tag' in value ||
        'status' in value
      ) {
        throw new TypeError('Invalid payload object')
      }
      // Snapshot schema output, checking nested values even for lying schemas.
      const json = JSON.stringify(value, (_key, field: unknown) => {
        if (typeof field === 'function' || typeof field === 'symbol')
          throw new TypeError('Invalid JSON value')
        return field
      })
      const fields = JSON.parse(json)
      if (
        fields === null ||
        typeof fields !== 'object' ||
        Array.isArray(fields) ||
        'tag' in fields ||
        'status' in fields
      ) {
        throw new TypeError('Invalid serialized payload object')
      }
      const error = createKnownError(tag, status, fields)
      pending.set(error, {
        stack: error.stack,
        finalize: async () => createKnownError(tag, status, JSON.parse(json)),
      })
      return error
    } catch {
      // Invalid outgoing payloads are programming errors, not declared failures.
    }
  }
  return createError({
    statusCode: 500,
    message: 'Invalid declared error payload',
  })
}

/** Internal composition seam. Resolve declarations before constructing context. */
export function createErrorContext(declared: readonly DeclaredError[]): {
  errors: Record<string, (...args: any[]) => H3Error>
} {
  const errors = Object.create(null) as Record<
    string,
    (...args: any[]) => H3Error
  >
  for (const { tag, status, schema, hasPayload } of byDistinctTag(declared)) {
    const standard = schema?.['~standard']
    const validate = standard?.validate.bind(standard)
    errors[tag] = Object.freeze((...args: unknown[]): H3Error => {
      // Phantom empty payloads take zero arguments; their shape is type-only.
      if (
        validate
          ? args.length !== 1
          : hasPayload
            ? args.length > 1
            : args.length !== 0
      ) {
        throw new TypeError(
          `[nuxt-handler-errors] invalid arguments for ${tag}`
        )
      }
      if (!validate) {
        const fields = (args[0] ?? {}) as Record<string, unknown>
        const error = createKnownError(tag, status, fields)
        pending.set(error, {
          stack: error.stack,
          finalize: async () => createKnownError(tag, status, fields),
        })
        return error
      }
      const result = validate(args[0])
      if (
        result instanceof Promise ||
        typeof (result as unknown as PromiseLike<unknown>).then === 'function'
      ) {
        // Handle rejection immediately, including errors that are never thrown.
        const settled = Promise.resolve(result).then<Validation, Validation>(
          (value) => ({ result: value }),
          (exception: unknown) => ({ exception })
        )
        const error = createError({ statusCode: status, message: tag })
        pending.set(error, {
          stack: error.stack,
          finalize: async () => {
            const outcome = await settled
            if ('exception' in outcome) throw outcome.exception
            return validatedError(tag, status, outcome.result)
          },
        })
        return error
      }
      return validatedError(tag, status, result)
    })
  }
  return Object.freeze({ errors: Object.freeze(errors) })
}

/** Internal catch seam: always throws; unrelated errors retain their identity. */
export async function finalizeError(error: unknown): Promise<never> {
  const deferred =
    error !== null && typeof error === 'object' ? pending.get(error) : undefined
  if (!deferred) throw error
  const finalized = await deferred.finalize()
  // Restore only the construction-time stack, never mutable error metadata.
  if (deferred.stack === undefined) delete finalized.stack
  else finalized.stack = deferred.stack
  const next = pending.get(finalized)
  if (next) next.stack = deferred.stack
  throw finalized
}
