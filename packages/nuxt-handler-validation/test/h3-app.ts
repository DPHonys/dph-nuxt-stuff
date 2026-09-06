/**
 * Shared mounting tools for the handler suites. Not a Vitest test file, so it
 * is not matched as a suite; knip reaches it through the suites importing it.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { AppOptions, EventHandler, H3Error } from 'h3'
import { createApp, createRouter, toWebHandler } from 'h3'
import * as v from 'valibot'

/**
 * Mount one handler and send it a request.
 *
 * `debug` is h3's verbose-errors switch, the knob a Nitro dev build turns on.
 * `route` mounts on h3's own router rather than the plain prefix, which is the
 * only way to get real route params. `onError` is h3's error hook, the only
 * place a suite sees the thrown error rather than its serialized body - and h3
 * wraps whatever was thrown into an `H3Error` before the hook sees it.
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
  const appOptions: AppOptions = { debug: options.debug ?? false }

  if (options.onError !== undefined) appOptions.onError = options.onError

  const app = createApp(appOptions)

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
 * Mount one handler, send it a request, and report the error h3's hook saw
 * beside the response - for the suites whose subject is the thrown error.
 */
export async function requestReporting(
  handler: EventHandler,
  path: string,
  options: { init?: RequestInit; route?: string } = {}
): Promise<{ response: Response; thrown: H3Error }> {
  let thrown: H3Error | undefined

  const response = await request(handler, path, {
    ...options,
    onError: (error) => void (thrown = error),
  })

  if (thrown === undefined) {
    throw new Error(`no error reached h3's hook for ${path}`)
  }

  return { response, thrown }
}

/**
 * A POST carrying an already-serialized JSON payload, so a malformed one is as
 * easy to send as a valid one. The caller's headers land last.
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
 * A value the types never saw - what a plain-JavaScript route file or a wire
 * hands over - as its JSON. Parsing is the one honest source of such a value:
 * `any` here is `JSON.parse`'s own answer, where every other spelling would be
 * a cast telling the compiler a lie.
 */
export function wire(json: string): any {
  return JSON.parse(json)
}

/**
 * The failure envelope as it reaches a client, parsed loosely: every key an
 * issue or the envelope carries is kept, so a suite asserting that nothing
 * extra crossed the wire still sees the extra.
 */
const FAILURE_BODY = v.looseObject({
  statusCode: v.number(),
  statusMessage: v.string(),
  data: v.looseObject({
    issues: v.array(
      v.looseObject({
        source: v.string(),
        message: v.string(),
        path: v.array(v.union([v.string(), v.number()])),
      })
    ),
  }),
})

/** What a failure answer said, parsed off the response. */
export type FailureBody = v.InferOutput<typeof FAILURE_BODY>

export async function failureBodyOf(response: Response): Promise<FailureBody> {
  return v.parse(FAILURE_BODY, await response.json())
}

/** Which sources a failure answer names, deduplicated. */
export async function sourcesOfIssues(response: Response): Promise<string[]> {
  const body = await failureBodyOf(response)

  return [...new Set(body.data.issues.map((issue) => issue.source))]
}
