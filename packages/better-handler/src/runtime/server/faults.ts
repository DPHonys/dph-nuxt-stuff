/**
 * How the package reports a developer's mistake. Two kinds, by when they are
 * found: at declaration, where there is no request to answer, and at request
 * time, where the route answers `500`. Neither is ever a Known error.
 */

import type { H3Error } from 'h3'
import { isFunction, isRecordLike } from '../shared/guards'
import { httpError } from '../shared/h3'

/** The module's `meta.name`, leading every sentence the package raises. */
const PREFIX = '[better-handler]'

/**
 * A mistake found while a request is served: a plain `500` carrying the
 * sentence, built through the h3 seam. It has no `data`, so it never carries
 * a `_tag` and `recognizeKnownError` never answers for a bug.
 *
 * Unhandled, as any server bug is: Nitro logs it with its stack in
 * development and production alike, a development client reads the sentence,
 * and a production client gets Nitro's generic `500` without it.
 */
export function developerFault(message: string): H3Error {
  return httpError({
    status: 500,
    message: `${PREFIX} ${message}`,
    unhandled: true,
  })
}

/**
 * A mistake found at declaration, when a route module is evaluated: a plain
 * `Error`, thrown before the route can serve anything.
 */
export function declarationFault(message: string): Error {
  return new Error(`${PREFIX} ${message}`)
}

/**
 * A value as the author would name it in a sentence about what they wrote or
 * sent: `null`, `an array`, `the primitive 42`, `a function`, `an instance of
 * Date`, `an empty object`, `a plain object`. Generic because it describes
 * whatever it is handed, typed or not.
 */
export function describeValue<Value>(value: Value): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'an array'
  if (isFunction(value)) return 'a function'
  if (Object(value) !== value) return `the primitive ${String(value)}`

  const prototype: unknown = Object.getPrototypeOf(value)

  if (prototype !== Object.prototype && prototype !== null) {
    const name =
      isRecordLike(prototype) &&
      'constructor' in prototype &&
      isFunction(prototype.constructor)
        ? prototype.constructor.name
        : ''

    return `an instance of ${name === '' ? 'an anonymous class' : name}`
  }

  return Object.keys(value).length === 0 ? 'an empty object' : 'a plain object'
}
