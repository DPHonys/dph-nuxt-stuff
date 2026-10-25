/**
 * The response development check: what a Handler handed over, asserted
 * against the schema its `output` declares for the status it answers under.
 * Both checks sit behind the `devChecks` flag, which the caller reads; both
 * refuse with a `developerFault`, a plain `500` with no `data`, so a route's
 * Known-error union never widens with an arm production cannot produce.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import type { StatusMap } from '../../types/io/output'
import { describeRoute, developerFault } from '../faults'
import { projectPath } from './issues'

// The statuses the map declares, in the order the runtime keeps them, which
// for the integer-like keys of a status map is ascending however they were
// written. A map naming no status never reaches here: it declares nothing.
function describeStatuses(statuses: StatusMap): string {
  return Object.keys(statuses).join(', ')
}

/**
 * Assert that a map-form route responded under a status its map names. The
 * compile guard's answer for a caller the types never saw: without it the
 * value check finds no schema at an undeclared status, skips, and the route
 * answers under a status nobody declared.
 *
 * Run before the status reaches the response, so what a client receives on a
 * refusal is this `500` rather than the status it refuses.
 */
export function checkRespondedStatus(
  event: H3Event,
  statuses: StatusMap,
  status: number
): void {
  // `hasOwn` rather than a test on the schema: a status declared `null` is
  // declared - it names a bodiless reply - and reads from a lookup exactly as
  // an undeclared one would.
  if (Object.hasOwn(statuses, status)) return

  throw developerFault(
    `cannot send the response: ${describeRoute(event)} answered ${status}, a status its declared Response output never names - the map names ${describeStatuses(statuses)}. ` +
      `Nothing checks the response in production, so this route would send that status as it is: respond under one of those, or name ${status} in \`output\`, or set \`devChecks: false\`.`
  )
}

// The value itself has no path of its own, so a root issue is named for what
// it is rather than given an empty string nobody could read. Projected the
// way a request-side issue's path is, so a null-prototype segment cannot turn
// this sentence into an unhandled throw of its own.
function describePath(path: StandardSchemaV1.Issue['path']): string {
  const projected = projectPath(path)

  return projected.length === 0 ? 'the response body' : projected.join('.')
}

function describeIssues(issues: readonly StandardSchemaV1.Issue[]): string {
  if (issues.length === 0) return 'the schema rejected it without saying why'

  return issues
    .map((issue) => `${describePath(issue.path)}: ${issue.message}`)
    .join('; ')
}

/**
 * Assert one handed-over value against the schema its status declares. An
 * assertion, never a transform: the result is discarded, so a development
 * server sends the bytes production sends. A status declared `null` has no
 * schema and nothing to assert.
 */
export async function checkResponse<Value>(
  event: H3Event,
  status: number,
  schema: StandardSchemaV1 | null | undefined,
  value: Value
): Promise<void> {
  if (schema === null || schema === undefined) return

  let issues: readonly StandardSchemaV1.Issue[] | undefined

  try {
    // Awaited: a Standard Schema may answer asynchronously, and a promise
    // read for `issues` would look like every value that passes.
    const result = await schema['~standard'].validate(value)

    issues = result.issues
  } catch (cause) {
    // A schema that throws instead of answering would otherwise replace the
    // response with its own exception, naming neither route nor status.
    throw developerFault(
      `cannot send the response: ${describeRoute(event)} answered ${status}, and the schema its Response output declares threw while checking the value instead of reporting issues - the cause is what it threw. ` +
        'Nothing runs the schema in production, so this route would send the value unchecked: fix the schema, or set `devChecks: false`.',
      cause
    )
  }

  // Discriminated on `issues`, never on `'value' in result`, as the request
  // side is: a success whose output is `undefined` carries no `value` key.
  if (issues === undefined) return

  throw developerFault(
    `cannot send the response: ${describeRoute(event)} answered ${status} with a value its declared Response output rejects - ${describeIssues(issues)}. ` +
      'Nothing checks the response in production, so this route would send that value as it is: fix the handler or the schema, or set `devChecks: false`.'
  )
}
