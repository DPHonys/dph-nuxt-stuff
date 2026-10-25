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

/**
 * Projection by construction, never by filtering: nothing is copied across
 * but the message and the normalised path, with the source named, so no
 * vendor extra on an issue - valibot's raw input among them - reaches a
 * client or an error hook.
 */
export function projectIssues(
  source: ValidationSource,
  issues: readonly StandardSchemaV1.Issue[]
): ValidationIssue[] {
  return issues.map((issue) => ({
    source,
    message: issue.message,
    path: projectPath(issue.path),
  }))
}
