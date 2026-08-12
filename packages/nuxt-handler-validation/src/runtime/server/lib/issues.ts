import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createError } from 'h3'
import type { ValidationSource } from '../../types/schemas'
import type { ValidationErrorData, ValidationIssue } from '../../types/wire'

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
function projectPath(
  path: StandardSchemaV1.Issue['path']
): Array<string | number> {
  if (path === undefined) return []

  return Array.from(path, (segment) => {
    const key = typeof segment === 'object' ? segment.key : segment

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
 */
export function raiseValidationError(
  source: ValidationSource,
  issues: readonly StandardSchemaV1.Issue[]
): never {
  const data: ValidationErrorData = { issues: projectIssues(source, issues) }

  // The message is a human summary only. Nothing may parse it - the wire
  // contract is the status, the reason phrase and `data.issues`.
  throw createError({
    statusCode: 400,
    statusMessage: 'Validation Error',
    message: `Validation failed for ${source}`,
    data,
  })
}
