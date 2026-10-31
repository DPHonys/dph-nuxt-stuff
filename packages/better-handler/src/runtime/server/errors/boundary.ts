/**
 * Recognition at a route's boundary: what a Handler that declares `errors`
 * does with whatever its body threw. A value whose `_tag` the route declares
 * is a Known error and goes out as one; everything else propagates as it was
 * thrown. Two development checks sit in front of the wire, both behind the
 * `devChecks` flag, both a plain `500` when they refuse.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { isFunction, isRecordLike, isString } from '../../shared/guards'
import { httpError } from '../../shared/h3'
import type { TaggedError } from '../../types/errors/tagged'
import { devChecksEnabled } from '../dev-checks'
import { developerFault } from '../faults'
import { describeDeclaredTags } from './declaration'
import type { ResolvedErrorEntry, ResolvedErrors } from './declaration'

/**
 * The `_tag` a thrown value carries, read by property access because a class
 * may keep it on its prototype, or `undefined` when it carries no string one.
 */
function tagOf<Thrown>(thrown: Thrown): string | undefined {
  if (!isRecordLike(thrown) || !('_tag' in thrown)) return undefined

  return isString(thrown._tag) ? thrown._tag : undefined
}

/**
 * The fields a thrown value goes out with: its own enumerable properties
 * beside `_tag`. An `Error`'s `message`, `stack` and `name` are its own but
 * not enumerable, and a class's methods live on its prototype, so neither is
 * a field.
 *
 * A function-valued field is left out, as JSON would leave it out - and a
 * `toJSON` among them would otherwise replace the whole of `data` when the
 * error body is serialised.
 */
function fieldsOf<Thrown extends object>(thrown: Thrown): object {
  const fields = Object.entries(thrown).filter(
    ([key, value]) => key !== '_tag' && !isFunction(value)
  )

  // `fromEntries` defines every key, so a field named `__proto__` stays a
  // field rather than becoming the prototype.
  return Object.fromEntries(fields)
}

/**
 * The Tagged error a thrown value goes out as: the declared tag first, then
 * the fields, so a field can never displace the tag. The spread defines every
 * key, as `fromEntries` does.
 */
function taggedErrorOf<Fields extends object>(
  tag: string,
  fields: Fields
): TaggedError {
  return { _tag: tag, ...fields }
}

/** The route as a sentence names it: its method and the path it was asked. */
function describeRoute(event: H3Event): string {
  return `${event.method} ${event.path}`
}

// The keys an issue's path names, joined; a segment may be a key or an object
// carrying one, and its key may be a symbol, which a template cannot print.
function describePath(path: StandardSchemaV1.Issue['path']): string {
  const keys = (path ?? []).map((segment) =>
    String(isRecordLike(segment) ? segment.key : segment)
  )

  return keys.length === 0 ? 'the fields' : keys.join('.')
}

function describeIssues(issues: readonly StandardSchemaV1.Issue[]): string {
  if (issues.length === 0) return 'the schema rejected them without saying why'

  return issues
    .map((issue) => `${describePath(issue.path)}: ${issue.message}`)
    .join('; ')
}

/**
 * The thrown-fields check: the fields about to go out, asserted against the
 * schema their entry declares. The schema describes the fields beside `_tag`
 * and may describe `_tag` too, as an Effect error class's does, so the fields
 * pass when they validate alone - which a strict schema not listing `_tag`
 * needs - or with `_tag` beside them, which a schema requiring it needs. When
 * neither does, the issues reported are the attempt with `_tag`'s. An
 * assertion, never a transform: the result is discarded, so a development
 * server sends what production sends.
 */
async function checkFields<Fields extends object>(
  event: H3Event,
  entry: ResolvedErrorEntry,
  fields: Fields,
  tagged: TaggedError
): Promise<void> {
  if (entry.schema === undefined) return

  // Called on `~standard`, not detached from it, as a library may read
  // `this`. Awaited: a Standard Schema may answer asynchronously, and a
  // promise read for `issues` would look like every value that passes.
  const standard = entry.schema['~standard']

  if ((await standard.validate(fields)).issues === undefined) return

  const result = await standard.validate(tagged)

  if (result.issues === undefined) return

  throw developerFault(
    `cannot send the error: ${describeRoute(event)} threw ${JSON.stringify(entry.tag)} with fields its declared schema rejects - ${describeIssues(result.issues)}. ` +
      'Nothing checks the fields in production, so this route would send them as they are: fix the handler or the schema, or set `devChecks: false`.'
  )
}

/**
 * The undeclared-tag check: a thrown value carrying a string `_tag` this
 * route never declared - a typo, or a tag declared on another route - which
 * production would let propagate as an unrecognised failure.
 */
function refuseUndeclaredTag(
  event: H3Event,
  errors: ResolvedErrors,
  tag: string
): never {
  throw developerFault(
    `cannot send the error: ${describeRoute(event)} threw a value tagged ${JSON.stringify(tag)}, which this route does not declare - it declares ${describeDeclaredTags(errors)}. ` +
      'Nothing checks this in production, where the value propagates as it was thrown: declare the tag in `errors` or throw a declared one, or set `devChecks: false`.'
  )
}

/**
 * Answer what a route's body threw, by throwing in its place: the Known error
 * a declared tag names, built through the h3 seam with the declared status,
 * the tag as its `message` and the Tagged error as its `data`; or the thrown
 * value itself, untouched. Status always comes from the declaration, never
 * from the thrown value.
 */
export async function answerThrown<Thrown>(
  event: H3Event,
  errors: ResolvedErrors,
  thrown: Thrown
): Promise<never> {
  const tag = tagOf(thrown)

  if (tag === undefined || !isRecordLike(thrown)) throw thrown

  // `hasOwn` on a prototype-less map, so `toString` is a declared tag or no
  // tag at all.
  const entry = Object.hasOwn(errors, tag) ? errors[tag] : undefined

  if (entry === undefined) {
    if (devChecksEnabled()) refuseUndeclaredTag(event, errors, tag)

    throw thrown
  }

  const fields = fieldsOf(thrown)
  const tagged = taggedErrorOf(tag, fields)

  if (devChecksEnabled()) await checkFields(event, entry, fields, tagged)

  throw httpError({ status: entry.status, message: tag, data: tagged })
}
