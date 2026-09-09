import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandlerResponse, H3Event } from 'h3'
import { createError } from 'h3'
import type { StatusMap } from '../../types'
import { projectPath } from './issues'

/**
 * Whether the dev-only response check runs. `import.meta.dev` is a build-time
 * constant in both the Nuxt and the Nitro build, so a production bundle starts
 * this `false` and never runs a schema on a response; the `checkResponses`
 * module option's `false` turns it off inside a dev server through the Nitro
 * plugin next door.
 */
// A module-level flag rather than a per-route capture: the plugin that clears
// it runs when the Nitro app is created, which a lazily evaluated route file
// can be either side of. Read per response, written once at most.
let checking = import.meta.dev === true

/**
 * Stop checking responses for the rest of this server's life - what the
 * `checkResponses: false` module option does, through its Nitro plugin. Also
 * the seam the suites drive: a check that only ever ran under a real dev
 * server could not be tested at all.
 */
export function setResponseChecking(next: boolean): void {
  checking = next
}

/** Whether the next response should be checked against its declared schema. */
export function checksResponses(): boolean {
  return checking
}

/**
 * Assert that a map-form route responded under a status its map names, and
 * throw if it did not. The compile guard's answer for a caller the types never
 * saw: without it the value check finds no schema at an undeclared status,
 * skips, and the route answers under a status nobody declared.
 *
 * Runs before the status reaches the response, so what a client receives on a
 * refusal is this `500` rather than the status it refuses.
 */
export function checkRespondedStatus(
  event: H3Event,
  statuses: StatusMap,
  status: number
): void {
  // `hasOwn` rather than a truthiness or `undefined` test on the schema: a
  // status declared `null` is declared - it names a bodiless reply - and reads
  // from this lookup exactly as an undeclared one would.
  if (Object.hasOwn(statuses, status)) return

  raiseUndeclaredStatus(event, statuses, status)
}

// The same plain `500` the value mismatch raises, for the same reasons: no
// marker and no Known-error tag, so a route's error union never widens with an
// arm production cannot produce.
function raiseUndeclaredStatus(
  event: H3Event,
  statuses: StatusMap,
  status: number
): never {
  throw createError({
    statusCode: 500,
    message:
      `[nuxt-handler-validation] cannot send the response: ${event.method} ${event.path} answered ${status}, a status its declared Response output never names - the map names ${describeStatuses(statuses)}. ` +
      `Nothing checks the response in production, so this route would send that status as it is: respond under one of those, or name ${status} in \`output\`.`,
  })
}

// The statuses the map declared, in the order the runtime keeps them, which
// for the integer-like keys of a status map is ascending however they were
// written. A map with no statuses at all never reaches here: `responseDelivery`
// refuses it when the route file is evaluated.
function describeStatuses(statuses: StatusMap): string {
  return Object.keys(statuses).join(', ')
}

/**
 * Assert one handed-over value against the schema its declared status
 * promised, and throw if it does not hold. An assertion, never a transform:
 * the result is discarded, so a dev server sends the same bytes as production.
 *
 * A status declared `null` has no schema and nothing to assert.
 */
export async function checkResponse(
  event: H3Event,
  status: number,
  schema: StandardSchemaV1 | null | undefined,
  value: EventHandlerResponse
): Promise<void> {
  if (schema === null || schema === undefined) return

  // Awaited: a Standard Schema may answer asynchronously, and a promise read
  // for `issues` would look like every value that passes.
  const result = await schema['~standard'].validate(value)

  // Discriminated on `issues`, never on `'value' in result`, exactly as the
  // request side does: a success whose output is `undefined` carries no
  // `value` key at all.
  if (result.issues === undefined) return

  raiseInvalidResponse(event, status, result.issues)
}

// A plain `500` with no marker and no Known-error tag: the Known-error union of
// a route never widens with an arm production cannot produce, and an
// observability hook that skips validation failures still reports this.
function raiseInvalidResponse(
  event: H3Event,
  status: number,
  issues: readonly StandardSchemaV1.Issue[]
): never {
  throw createError({
    statusCode: 500,
    message:
      `[nuxt-handler-validation] cannot send the response: ${event.method} ${event.path} answered ${status} with a value its declared Response output rejects - ${describeIssues(issues)}. ` +
      `Nothing checks the response in production, so this route would send that value as it is: fix the handler or the schema, or set \`checkResponses: false\`.`,
  })
}

// Path and message per issue, joined - the whole of what the schema reported,
// projected the same way a request-side issue's path is so a null-prototype
// segment cannot turn this diagnostic into an unhandled throw of its own.
function describeIssues(issues: readonly StandardSchemaV1.Issue[]): string {
  if (issues.length === 0) return 'the schema rejected it without saying why'

  return issues
    .map((issue) => `${describePath(issue.path)}: ${issue.message}`)
    .join('; ')
}

// The value itself has no path of its own, so a root issue is named for what
// it is rather than given an empty string nobody could read.
function describePath(path: StandardSchemaV1.Issue['path']): string {
  const projected = projectPath(path)

  return projected.length === 0 ? 'the response body' : projected.join('.')
}
