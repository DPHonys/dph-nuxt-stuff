import { isRecordLike } from '../../shared/guards'
import { describeValue, developerFault } from '../faults'
import { describeDeclaredTags } from './declaration'
import type { ResolvedErrors } from './declaration'

/**
 * What the Fail helper returns: an `Error`, so a throw has a stack trace,
 * carrying `_tag` and the fields as own enumerable properties - the shape the
 * route's boundary reads off any thrown value, an Effect tagged error's
 * included.
 */
class FailedError<Fields extends object> extends Error {
  // Assigned below as an own property; `declare` emits no class field, which
  // would be defined before the fields and could not be told from one.
  declare readonly _tag: string

  constructor(tag: string, fields: Fields, above: RuntimeFail) {
    super(tag)

    // Before the fields, so a field named `stack` is the field. The frames
    // start at the handler that called `fail`, not inside it.
    Error.captureStackTrace(this, above)

    Object.defineProperty(this, '_tag', {
      value: tag,
      enumerable: true,
      writable: false,
      configurable: true,
    })

    for (const [key, value] of Object.entries(fields)) {
      // The tag is the declared key's, never a field's.
      if (key === '_tag') continue

      // Defined, not assigned: `message` and `stack` are already own
      // non-enumerable properties of an `Error`, and an assignment would
      // change their value but leave them out of the fields.
      Object.defineProperty(this, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
  }
}

// On the prototype rather than as a class field, so an own `name` is only
// ever a field.
Object.defineProperty(FailedError.prototype, 'name', {
  value: 'FailedError',
  writable: true,
  configurable: true,
})

/**
 * The Fail helper as the runtime builds it, before the Handler context types
 * it as `Fail<Errors>`.
 */
export type RuntimeFail = (tag: string, ...fields: unknown[]) => Error

/**
 * The Fail helper for one route's checked declarations. The compile-time
 * pairing is the guard; what is checked here is only what a caller the types
 * never saw can get wrong, each a developer fault: a tag the route does not
 * declare, fields for a tag declared without a schema, or no fields object
 * for a tag declared with one. The fields themselves are not validated here;
 * nothing runs the schema in production.
 */
export function createFail(errors: ResolvedErrors): RuntimeFail {
  const fail: RuntimeFail = (tag, ...args) => {
    // `hasOwn` on a prototype-less map, so `toString` is a tag this route
    // declares or no tag at all.
    const entry = Object.hasOwn(errors, tag) ? errors[tag] : undefined

    if (entry === undefined) {
      throw developerFault(
        `fail(${JSON.stringify(tag)}) names no error this route declares. The route declares ${describeDeclaredTags(errors)}.`
      )
    }

    if (entry.schema === undefined) {
      if (args.length === 0) return new FailedError(tag, {}, fail)

      throw developerFault(
        `fail(${JSON.stringify(tag)}) takes no fields: the error is declared without a schema, and was handed ${describeValue(args[0])}.`
      )
    }

    const [fields] = args

    if (args.length === 1 && isRecordLike(fields)) {
      return new FailedError(tag, fields, fail)
    }

    const handed =
      args.length === 1
        ? describeValue(fields)
        : args.length === 0
          ? 'nothing'
          : `${args.length} arguments`

    throw developerFault(
      `fail(${JSON.stringify(tag)}) takes one object of the fields its schema describes, and was handed ${handed}.`
    )
  }

  return fail
}
