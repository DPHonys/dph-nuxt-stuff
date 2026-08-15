/**
 * The primary seam's tools: a handler built by this package, mounted in a real
 * h3 app and driven by real requests. Half of this package's decisions are
 * claims about h3's own behaviour, so the app is h3's, never a double of it.
 *
 * Not a Vitest test file, so it is not matched by `vitest.config.ts`'s
 * `include`; knip reaches it through the suites importing it.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler, H3Error } from 'h3'
import { createApp, createRouter, toWebHandler } from 'h3'

/**
 * Mount one handler and send it a request. `debug` is h3's own verbose-errors
 * switch - the knob a Nitro dev build turns on, and the only thing in the tree
 * that could make a failure body differ between development and production.
 *
 * `route` mounts the handler on h3's own router instead of the plain prefix,
 * which is the only way to get real route params: `event.context.params` is
 * filled by the router's match, so every claim a suite makes about params
 * - decoding, catch-all joining, the anonymous key - is a claim about that
 * matcher, and it has to be h3's.
 *
 * `onError` is h3's own error hook - the seat a Nitro `error` hook sits in, and
 * the only place an operator sees an error this package raised rather than the
 * response a client received.
 */
export function request(
  handler: EventHandler,
  path: string,
  options: {
    init?: RequestInit
    debug?: boolean
    route?: string
    onError?: (error: H3Error) => void
  } = {}
): Promise<Response> {
  const app = createApp({
    debug: options.debug ?? false,
    ...(options.onError !== undefined && { onError: options.onError }),
  })

  if (options.route === undefined) {
    app.use('/api/test', handler)
  } else {
    app.use(createRouter().use(options.route, handler))
  }

  return toWebHandler(app)(
    new Request(`http://test.local${path}`, options.init)
  )
}

/**
 * A POST carrying an already-serialized JSON payload, so a test can send a
 * malformed one as easily as a valid one. The caller's headers land last, which
 * makes this the door to any content type as well.
 */
export function postJson(
  payload: string,
  headers: Record<string, string> = {}
): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  }
}

/**
 * A schema whose `validate` is whatever the caller passes - the door to the
 * shapes the Standard Schema interface permits but no library in the tree
 * produces, and to observing what a schema was handed.
 */
export function schemaValidating(
  validate: (raw: unknown) => StandardSchemaV1.Result<unknown>
): StandardSchemaV1 {
  return { '~standard': { version: 1, vendor: 'test', validate } }
}

/** A schema that hands back one fixed result, whatever it is given. */
export function schemaReturning(
  result: StandardSchemaV1.Result<unknown>
): StandardSchemaV1 {
  return schemaValidating(() => result)
}

/**
 * Which sources a failure answer names - deduplicated, so a response naming
 * two would show up as two.
 */
export async function sourcesOfIssues(response: Response): Promise<string[]> {
  const body = (await response.json()) as {
    data: { issues: Array<{ source: string }> }
  }

  return [...new Set(body.data.issues.map((issue) => issue.source))]
}
