import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  isFunction,
  isNumber,
  isRecordLike,
  isString,
} from '../../shared/guards'
import type { ValidationIssue, ValidationSource } from '../../types/io/input'
import { describeValue } from '../faults'

/**
 * The per-request failure door: receives one source's projected issues and
 * must not return. Every client-input rejection goes through it - a rejecting
 * schema and an unparseable body alike - and nothing else does.
 */
export type OnInvalid = (
  source: ValidationSource,
  issues: readonly ValidationIssue[]
) => never

/**
 * One path key as a projected path carries it: a string or a number as it
 * is, anything else as text. Total: an object without a prototype, which
 * `String()` throws on, is described instead, so a validation failure never
 * becomes a `500` from inside the answer it is building.
 */
function projectKey<Key>(key: Key): string | number {
  if (isString(key) || isNumber(key)) return key
  if (isRecordLike(key) || isFunction(key)) return describeValue(key)

  return String(key)
}

/**
 * One issue's path, normalised to plain keys. A segment is a key or an object
 * carrying one; a `null` segment, which the interface forbids and a
 * hand-written schema can still produce, is a key like any other rather than
 * an object to dereference, and a null-prototype carrier is read like any
 * other carrier.
 */
export function projectPath(
  path: StandardSchemaV1.Issue['path']
): Array<string | number> {
  if (path === undefined) return []

  return Array.from(path, (segment) => {
    if (!isRecordLike(segment)) return projectKey(segment)

    return projectKey('key' in segment ? segment.key : undefined)
  })
}

/** What a development check calls the value it asserted, in its sentence. */
export interface CheckedValueNames {
  /** An issue at the value itself, which has no path of its own. */
  readonly root: string
  /** A rejection that reported no issue at all. */
  readonly unexplained: string
}

/**
 * Issues as a development check's refusal names them: each one's path,
 * projected as a client-input issue's is and joined with dots, then its
 * message. Projected rather than printed, so a null-prototype segment or key
 * cannot turn the refusal into an unhandled throw of its own.
 */
export function describeIssues(
  issues: readonly StandardSchemaV1.Issue[],
  names: CheckedValueNames
): string {
  if (issues.length === 0) return names.unexplained

  return issues
    .map((issue) => {
      const path = projectPath(issue.path)

      return `${path.length === 0 ? names.root : path.join('.')}: ${issue.message}`
    })
    .join('; ')
}

/** What a raw request value is replaced with inside a projected message. */
const REDACTED = '<redacted>'

/** A letter, a digit or `_`: what a value must not be glued to, to match. */
const WORD_CHARACTER = /[\p{L}\p{N}_]/u

/**
 * How a raw value can be written out inside a message: as itself, when it is
 * a string, a number or a boolean, and as JSON, which is how a string usually
 * lands - quoted. Empty spellings are dropped: an empty string occurs
 * everywhere.
 */
function spellingsOf<Value>(value: Value): string[] {
  const spellings: string[] = []

  if (isString(value) || isNumber(value) || value === true || value === false)
    spellings.push(String(value))

  try {
    // `undefined` at runtime for `undefined` and a function, whatever the
    // declaration says.
    const json: string | undefined = JSON.stringify(value)

    if (json !== undefined) spellings.push(json)
  } catch {
    // A bigint, a cycle or a throwing `toJSON` has no JSON spelling.
  }

  return spellings.filter((spelling) => spelling !== '')
}

/**
 * The spellings of the value at a projected path inside a source, or none
 * when nothing is there. Read through own data properties only, so walking
 * the path runs no getter and never reaches the prototype.
 */
function spellingsAt<Source>(
  source: Source,
  path: ReadonlyArray<string | number>
): string[] {
  const [key, ...rest] = path

  if (key === undefined) return spellingsOf(source)
  if (!isRecordLike(source) && !Array.isArray(source)) return []

  const property = Object.getOwnPropertyDescriptor(source, key)

  if (property === undefined || !('value' in property)) return []

  return spellingsAt(property.value, rest)
}

/** One spelling as a pattern, never matching inside a longer word. */
function patternOf(spelling: string): string {
  const escaped = spelling.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&')
  const before = WORD_CHARACTER.test(spelling.at(0) ?? '')
    ? '(?<![\\p{L}\\p{N}_])'
    : ''
  const after = WORD_CHARACTER.test(spelling.at(-1) ?? '')
    ? '(?![\\p{L}\\p{N}_])'
    : ''

  return `${before}${escaped}${after}`
}

/**
 * An issue's message with every raw request value it repeats replaced by
 * `<redacted>`: the issue's own `input` when the vendor attached one, and the
 * value at the issue's path in the source that was validated. One pass over
 * the longest spellings first, so a quoted value goes whole and nothing
 * already replaced is matched again; a value only matches standing on its
 * own, so an `x` sent in a query leaves `Expected` alone.
 */
function redactedMessage<Raw>(
  issue: StandardSchemaV1.Issue,
  path: ReadonlyArray<string | number>,
  raw: Raw
): string {
  const spellings = [
    ...new Set([
      ...spellingsAt(raw, path),
      ...('input' in issue ? spellingsOf(issue.input) : []),
    ]),
  ].toSorted((left, right) => right.length - left.length)

  if (spellings.length === 0) return issue.message

  const pattern = new RegExp(spellings.map(patternOf).join('|'), 'gu')

  return issue.message.replace(pattern, () => REDACTED)
}

/**
 * Projection by construction, never by filtering: nothing is copied across
 * but the message and the normalised path, with the source named, so no
 * vendor extra on an issue - valibot's raw input among them - reaches a
 * client or an error hook. Nor does the raw input inside the message: a
 * message repeating the issue's `input`, or the value at its path in `raw`,
 * the source as it was validated, has that value replaced by `<redacted>`,
 * as valibot's default `but received "..."` would otherwise send a header's
 * credential back out. The message itself is kept.
 */
export function projectIssues<Raw>(
  source: ValidationSource,
  issues: readonly StandardSchemaV1.Issue[],
  raw: Raw
): ValidationIssue[] {
  return issues.map((issue) => {
    const path = projectPath(issue.path)

    return { source, message: redactedMessage(issue, path, raw), path }
  })
}
