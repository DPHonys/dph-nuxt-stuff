import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import { createError } from 'h3'
import type {
  ErrorDefinitions,
  ErrorDefinitionsGuard,
  ErrorFactories,
} from '../../types/error-definitions'
import { createKnownError } from './declared'

type Validation =
  | { result: StandardSchemaV1.Result<unknown> }
  | { exception: unknown }

// No discoverable symbol or writable property can forge deferred validation.
const pending = new WeakMap<object, () => Promise<H3Error>>()

function validatedError(
  tag: string,
  status: number,
  result: StandardSchemaV1.Result<unknown>
): H3Error {
  if (!result.issues) {
    try {
      // Snapshot the wire value now: schemas may return cycles, bigint or mutable
      // objects even when their declared output type claims otherwise.
      const json = JSON.stringify(result.value, (_key, value: unknown) => {
        if (typeof value === 'function' || typeof value === 'symbol') {
          throw new TypeError('Invalid JSON value')
        }
        return value
      })
      if (json !== undefined) {
        return createKnownError(tag, status, { data: JSON.parse(json) })
      }
    } catch {
      // Invalid outgoing data is a programming error, not a declared failure.
    }
  }
  return createError({
    statusCode: 500,
    message: 'Invalid declared error data',
  })
}

/** Internal composition seam. Resolves declarations once, before serving requests. */
export function createErrorContext<const D extends ErrorDefinitions>(
  definitions: D & ErrorDefinitionsGuard<D>
): { readonly errors: ErrorFactories<D> } {
  if (
    definitions === null ||
    typeof definitions !== 'object' ||
    Array.isArray(definitions) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(definitions))
  ) {
    throw new TypeError(
      '[nuxt-handler-errors] errors must be a definition record'
    )
  }

  const errors = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(definitions)) {
    const descriptor = Object.getOwnPropertyDescriptor(definitions, key)!
    const definition = descriptor.value
    if (
      typeof key !== 'string' ||
      !descriptor.enumerable ||
      definition === null ||
      typeof definition !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(definition)) ||
      Reflect.ownKeys(definition).some(
        (field) =>
          (field !== 'status' && field !== 'data') ||
          !Object.hasOwn(
            Object.getOwnPropertyDescriptor(definition, field)!,
            'value'
          )
      ) ||
      !Object.hasOwn(definition, 'status') ||
      !Number.isInteger(definition.status) ||
      definition.status < 400 ||
      definition.status > 599
    ) {
      throw new TypeError('[nuxt-handler-errors] invalid error definition')
    }
    const tag = key
    const status: number = definition.status
    const hasData = Object.hasOwn(definition, 'data')
    const standard = definition.data?.['~standard']
    if (
      hasData &&
      (standard === null ||
        typeof standard !== 'object' ||
        standard.version !== 1 ||
        typeof standard.vendor !== 'string' ||
        typeof standard.validate !== 'function')
    ) {
      throw new TypeError(
        `[nuxt-handler-errors] invalid Standard Schema for ${tag}`
      )
    }
    const validate = hasData
      ? (standard as StandardSchemaV1.Props).validate.bind(standard)
      : undefined
    const factory = (...args: unknown[]): H3Error => {
      if (args.length !== (hasData ? 1 : 0)) {
        throw new TypeError(
          `[nuxt-handler-errors] invalid arguments for ${tag}`
        )
      }
      if (!validate) {
        const error = createKnownError(tag, status, {})
        pending.set(error, async () => createKnownError(tag, status, {}))
        return error
      }
      const result = validate(args[0])
      if (
        result instanceof Promise ||
        typeof (result as unknown as PromiseLike<unknown>).then === 'function'
      ) {
        // Attach rejection handling now, even if the caller never throws the error.
        const settled = Promise.resolve(result).then<Validation, Validation>(
          (value) => ({ result: value }),
          (exception: unknown) => ({ exception })
        )
        const error = createError({ statusCode: status, message: tag })
        pending.set(error, async () => {
          const outcome = await settled
          if ('exception' in outcome) throw outcome.exception
          return validatedError(tag, status, outcome.result)
        })
        return error
      }
      const error = validatedError(tag, status, result)
      pending.set(error, async () => validatedError(tag, status, result))
      return error
    }
    errors[tag] = Object.freeze(Object.assign(factory, { tag, status }))
  }
  return Object.freeze({ errors: Object.freeze(errors) as ErrorFactories<D> })
}

/** Internal catch seam: always throws; unrelated errors retain their identity. */
export async function finalizeError(error: unknown): Promise<never> {
  const finalize =
    error !== null && typeof error === 'object' ? pending.get(error) : undefined
  throw finalize ? await finalize() : error
}
