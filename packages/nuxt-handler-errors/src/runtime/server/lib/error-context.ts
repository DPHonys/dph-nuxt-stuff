import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import { createError } from 'h3'
import type { PlainObject } from '../../shared/plain-object'
import { isPlainObject } from '../../shared/plain-object'
import type { DeclaredError } from './declared'
import { createKnownError, factoryName } from './declared'

// Invalid outgoing payloads are programming errors, not declared failures.
function invalidPayload(): H3Error {
  return createError({
    statusCode: 500,
    message: 'Invalid declared error payload',
  })
}

// What a payload may be once the wire has settled it: an object - not an
// array, not a primitive - that does not spoof either reserved name.
function isPayloadFields(settled: unknown): settled is PlainObject {
  return isPlainObject(settled) && !('tag' in settled) && !('status' in settled)
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
  let settled: unknown
  try {
    settled = JSON.parse(JSON.stringify(result.value))
  } catch {
    return invalidPayload()
  }
  return isPayloadFields(settled)
    ? createKnownError(tag, status, settled)
    : invalidPayload()
}

/** One handler-local factory: the declared payload in, a finished `H3Error` out. */
export type ErrorFactory = (...args: any[]) => H3Error

/** The handler context as the runtime builds it: one factory per declared tag. */
export interface ErrorContext {
  readonly errors: Record<string, ErrorFactory>
}

/** Internal composition seam. Resolve declarations before constructing context. */
export function createErrorContext(
  declared: readonly DeclaredError[]
): ErrorContext {
  // Prototype-less, so a tag like `constructor` is an own factory and nothing
  // else; `Object.create(null)` is untyped, and the annotation types it.
  const errors: Record<string, ErrorFactory> = Object.create(null)
  for (const { tag, status, schema } of declared) {
    const standard = schema?.['~standard']
    // Bound once: a schema swapped after declaration is not consulted.
    const validate = standard?.validate.bind(standard)
    errors[factoryName(tag)] = Object.freeze((...args: unknown[]): H3Error => {
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
