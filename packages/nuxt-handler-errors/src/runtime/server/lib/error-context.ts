import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import { createError } from 'h3'
import type { DeclaredError } from './declared'
import { createKnownError } from './declared'

// Invalid outgoing payloads are programming errors, not declared failures.
function invalidPayload(): H3Error {
  return createError({
    statusCode: 500,
    message: 'Invalid declared error payload',
  })
}

// A JSON round trip snapshots the output and settles `toJSON`, dates and
// dropped fields the way the wire would; the parsed result is what the
// client will read, so that is what the reserved-key check runs on.
function payloadError(
  tag: string,
  status: number,
  result: StandardSchemaV1.Result<unknown>
): H3Error {
  if (result.issues) return invalidPayload()
  let fields: unknown
  try {
    fields = JSON.parse(JSON.stringify(result.value))
  } catch {
    return invalidPayload()
  }
  if (
    fields === null ||
    typeof fields !== 'object' ||
    Array.isArray(fields) ||
    'tag' in fields ||
    'status' in fields
  ) {
    return invalidPayload()
  }
  return createKnownError(tag, status, fields as Record<string, unknown>)
}

/** Internal composition seam. Resolve declarations before constructing context. */
export function createErrorContext(declared: readonly DeclaredError[]): {
  errors: Record<string, (...args: any[]) => H3Error>
} {
  const errors = Object.create(null) as Record<
    string,
    (...args: any[]) => H3Error
  >
  for (const { tag, status, schema } of declared) {
    const standard = schema?.['~standard']
    // Bound once: a schema swapped after declaration is not consulted.
    const validate = standard?.validate.bind(standard)
    errors[tag] = Object.freeze((...args: unknown[]): H3Error => {
      if (args.length !== (validate ? 1 : 0)) {
        throw new TypeError(
          `[nuxt-handler-errors] invalid arguments for ${tag}`
        )
      }
      if (!validate) return createKnownError(tag, status, {})
      const result = validate(args[0])
      if (result instanceof Promise) {
        // Settled so a rejection is not reported as unhandled on top of this.
        result.then(undefined, () => {})
        throw new TypeError(
          `[nuxt-handler-errors] the payload schema for ${tag} validates asynchronously; factories are synchronous, so use a synchronous schema or validate before calling the factory`
        )
      }
      return payloadError(tag, status, result)
    })
  }
  return Object.freeze({ errors: Object.freeze(errors) })
}
