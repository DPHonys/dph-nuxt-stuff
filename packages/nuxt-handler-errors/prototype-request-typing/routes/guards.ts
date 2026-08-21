import { defineError } from '../../src/runtime/server'
import { schema } from '../lib/schema'
import { defineTypedEventHandler } from '../lib/typed-handler'

const reserved = defineError('validation-failed', { status: 400 })

// @ts-expect-error - bare {} is a compile error: declare validate, errors, or both
export const empty = defineTypedEventHandler({}, () => 1)

// @ts-expect-error - the built-in tag is reserved on every umbrella route
export const usesReserved = defineTypedEventHandler({ errors: [reserved] }, () => 1)

export const bodyOnUnknownSchema = defineTypedEventHandler(
  { validate: { body: schema<unknown>() } },
  (_e, { body }) => ({ got: body })
)
