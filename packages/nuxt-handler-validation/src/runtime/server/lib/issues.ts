import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createError } from 'h3'
import { markValidationError } from '../../shared/error-marker'
import type {
  ValidationErrorData,
  ValidationIssue,
  ValidationSource,
} from '../../types'

// Projection by construction, never by filtering: nothing is copied across but
// the message and the normalized path, so no vendor extra can reach a client
// even in a version of a library nobody has read. This is the sanitization -
// which is why there is no redaction option and no production branch.
function projectIssues(
  source: ValidationSource,
  issues: readonly StandardSchemaV1.Issue[]
): ValidationIssue[] {
  return issues.map((issue) => ({
    source,
    message: issue.message,
    path: projectPath(issue.path),
  }))
}

// Object segments collapse to their `key`; anything that is not already a
// string or a number - a symbol key, most of all - stringifies, so a segment
// is never dropped and never `null`.
//
// The null check is not redundant: `typeof null === 'object'`, so without it a
// `null` segment - which the interface forbids and a hand-written schema can
// still produce - is read as an object segment and dereferenced, throwing from
// inside the `400` this is building and turning a validation failure into an
// unhandled `500`. It stringifies like every other segment that is neither a
// string nor a number.
function projectPath(
  path: StandardSchemaV1.Issue['path']
): Array<string | number> {
  if (path === undefined) return []

  return Array.from(path, (segment) => {
    const key =
      segment !== null && typeof segment === 'object' ? segment.key : segment

    return typeof key === 'string' || typeof key === 'number'
      ? key
      : String(key)
  })
}

/**
 * The one failure this package answers with: `400`, one fixed shape, identical
 * in dev and prod, over the projected issues.
 *
 * One source per raise, because validation is fail-fast across sources - a
 * source's issues all arrive together, so `issues` is everything that source's
 * schemas had to say. The `source` tag is still stamped per issue, which is
 * what keeps the array h3 v2-compatible.
 *
 * This is the **only** raise in the package that marks its error, and that is
 * the whole rule: what reaches here is a client's bad input, so an
 * observability hook may skip it. Everything else this package throws is a
 * developer mistake and must keep reporting.
 */
export function raiseValidationError(
  source: ValidationSource,
  issues: readonly StandardSchemaV1.Issue[]
): never {
  const data: ValidationErrorData = { issues: projectIssues(source, issues) }

  // The message is a human summary only. Nothing may parse it - the wire
  // contract is the status, the reason phrase and `data.issues`.
  const error = createError({
    statusCode: 400,
    statusMessage: 'Validation Error',
    message: `Validation failed for ${source}`,
    data,
  })

  // `createError` is what makes the carrier an H3Error, which is what makes the
  // marker survive the path to the `error` hook - so the mark goes on its
  // product, never on a value thrown bare.
  markValidationError(error, data.issues)

  throw error
}
