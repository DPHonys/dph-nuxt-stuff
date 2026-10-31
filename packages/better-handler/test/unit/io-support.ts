/**
 * What the io suites share: a schema that answers with one fixed result, and
 * the Built-in validation-failed variant's body, parsed. Not a Vitest test
 * file, so it is not matched as a suite; knip reaches it through the suites
 * importing it.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import { z } from 'zod'

/**
 * A schema handing back one fixed result: the door to the shapes the
 * Standard Schema interface permits but no library in the tree produces.
 */
export function schemaReturning<Output>(
  result: StandardSchemaV1.Result<Output>
): StandardSchemaV1<Output, Output> {
  return {
    '~standard': { version: 1, vendor: 'test', validate: () => result },
  }
}

/**
 * The variant's body as a bare h3 app sends it, parsed loosely: every key the
 * body, its `data` or an issue carries is kept, so a suite asserting that
 * nothing extra crossed still sees the extra. h3 alone sends no `message`;
 * the whole Nitro body is the wire suites' to assert.
 */
const VALIDATION_FAILED_BODY = z.looseObject({
  statusCode: z.literal(400),
  data: z.looseObject({
    _tag: z.string(),
    issues: z.array(
      z.looseObject({
        source: z.string(),
        message: z.string(),
        path: z.array(z.union([z.string(), z.number()])),
      })
    ),
  }),
})

/** The body of a response that must be the Built-in validation-failed variant. */
export async function validationFailedBodyOf(
  response: Response
): Promise<z.infer<typeof VALIDATION_FAILED_BODY>> {
  return VALIDATION_FAILED_BODY.parse(await response.json())
}

/** Which sources a validation failure names, deduplicated. */
export async function sourcesOfIssues(response: Response): Promise<string[]> {
  const body = await validationFailedBodyOf(response)

  return [...new Set(body.data.issues.map((issue) => issue.source))]
}
