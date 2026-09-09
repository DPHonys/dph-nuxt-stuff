/**
 * This package's additions to the shared mounting tools. Not a Vitest test
 * file, so it is not matched as a suite; knip reaches it through the suites
 * importing it.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import { z } from 'zod'

// The mounting itself is the shared harness; what stays here is this
// package's own failure shape.
export {
  postJson,
  request,
  requestReporting,
  untyped,
  wire,
} from '@dphonys/test-utils/h3-app'

/**
 * A schema handing back one fixed result - the door to the shapes the Standard
 * Schema interface permits but no library in the tree produces.
 */
export function schemaReturning(
  result: StandardSchemaV1.Result<unknown>
): StandardSchemaV1 {
  return {
    '~standard': { version: 1, vendor: 'test', validate: () => result },
  }
}

/**
 * The issues payload as the error carries it and as it crosses the wire,
 * parsed loosely: every key an issue or the payload carries is kept, so a
 * suite asserting that nothing extra crossed still sees the extra.
 */
const ISSUES_PAYLOAD = z.looseObject({
  issues: z.array(
    z.looseObject({
      source: z.string(),
      message: z.string(),
      path: z.array(z.union([z.string(), z.number()])),
    })
  ),
})

/** Narrows an error's `data` in place - no copy, so identity claims hold. */
export function isIssuesPayload(
  value: H3Error['data']
): value is z.infer<typeof ISSUES_PAYLOAD> {
  return ISSUES_PAYLOAD.safeParse(value).success
}

/** The failure envelope around that payload, as it reaches a client. */
const FAILURE_BODY = z.looseObject({
  statusCode: z.number(),
  statusMessage: z.string(),
  data: ISSUES_PAYLOAD,
})

export async function failureBodyOf(
  response: Response
): Promise<z.infer<typeof FAILURE_BODY>> {
  return FAILURE_BODY.parse(await response.json())
}

/** Which sources a failure answer names, deduplicated. */
export async function sourcesOfIssues(response: Response): Promise<string[]> {
  const body = await failureBodyOf(response)

  return [...new Set(body.data.issues.map((issue) => issue.source))]
}
