/**
 * Shared mounting tools for the handler suites. Not a Vitest test file, so it
 * is not matched as a suite; knip reaches it through the suites importing it.
 */

import type { AppOptions, EventHandler, H3Error } from 'h3'
import { createApp, createRouter, toWebHandler } from 'h3'

/** The knobs one mounted request takes. */
export interface RequestOptions {
  init?: RequestInit
  /** h3's verbose-errors switch, the knob a Nitro dev build turns on. */
  debug?: boolean
  /** Mounts on h3's own router, the only way to get real route params. */
  route?: string
  /** h3's error hook: the only place a suite sees the thrown error itself. */
  onError?: (error: H3Error) => void
}

/** Mount one handler and send it a request for `path`. */
export function request(
  handler: EventHandler,
  path: string,
  options: RequestOptions = {}
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

/** The first error a suite's `onError` saw; none is a failed expectation. */
export function firstError(seen: readonly H3Error[]): H3Error {
  const [error] = seen

  if (error === undefined) throw new Error('no error reached onError')

  return error
}
