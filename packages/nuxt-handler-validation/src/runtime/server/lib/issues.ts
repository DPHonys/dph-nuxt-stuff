import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createError } from 'h3'
import { z } from 'zod'
import { markValidationError } from '../../shared/error-marker'
import type {
  ValidationErrorData,
  ValidationIssue,
  ValidationSource,
} from '../../types'

/**
 * The per-request failure door. Receives projected issues, all from one
 * source, and must not return.
 */
export type OnInvalid = (
  source: ValidationSource,
  issues: readonly ValidationIssue[]
) => never

/**
 * Projection by construction, never by filtering: nothing is copied across but
 * the message and the normalized path, so no vendor extra reaches a client or
 * an `onInvalid` hook. Module-level for `validate.ts`; no entry re-exports it.
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

/** The two key shapes a projected path carries; everything else stringifies. */
const PATH_KEY = z.union([z.string(), z.number()])

function isPathKey(value: unknown): value is string | number {
  return PATH_KEY.safeParse(value).success
}

// A segment is a key or an object carrying one. The explicit `null` guard keeps
// a `null` segment - which the interface forbids and a hand-written schema can
// still produce - on the key side, where it stringifies instead of being
// dereferenced from inside the `400` this is building. `typeof` rather than
// `instanceof Object` is what keeps a null-prototype segment on the object side:
// it is a valid carrier of `key`, and `String()` on it would throw. Either slip
// would turn a validation failure into an unhandled `500`.
function projectPath(
  path: StandardSchemaV1.Issue['path']
): Array<string | number> {
  if (path === undefined) return []

  return Array.from(path, (segment) => {
    const key =
      segment !== null && typeof segment === 'object' ? segment.key : segment

    return isPathKey(key) ? key : String(key)
  })
}

/**
 * The default `onInvalid`: `400`, one fixed shape, identical in dev and prod,
 * over one source's projected issues. It is also the only raise in the package
 * that marks its error - what reaches here is a client's bad input, so an
 * observability hook may skip it.
 */
export function raiseValidationError(
  source: ValidationSource,
  issues: readonly ValidationIssue[]
): never {
  const data: ValidationErrorData = { issues: [...issues] }

  // The message is a human summary only. Nothing may parse it - the wire
  // contract is the status, the reason phrase and `data.issues`.
  const error = createError({
    statusCode: 400,
    statusMessage: 'Validation Error',
    message: `Validation failed for ${source}`,
    data,
  })

  // The mark goes on `createError`'s product, never on a value thrown bare:
  // only an H3Error carries it as far as the `error` hook.
  markValidationError(error, data.issues)

  throw error
}
