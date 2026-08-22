/**
 * Shared mounting tools for the handler suites. Not a Vitest test file, so it
 * is not matched as a suite; knip reaches it through the suites importing it.
 */

import type { EventHandler } from 'h3'
import { createApp, createRouter, toWebHandler } from 'h3'

/**
 * Mount one handler and send it a request.
 *
 * `debug` is h3's verbose-errors switch, the knob a Nitro dev build turns on.
 * `route` mounts on h3's own router rather than the plain prefix, which is the
 * only way to get real route params. `onError` is h3's error hook, the only
 * place a suite sees the thrown error rather than its serialized body.
 */
export function request(
  handler: EventHandler,
  path: string,
  options: {
    init?: RequestInit
    debug?: boolean
    route?: string
    onError?: (error: unknown) => void
  } = {}
): Promise<Response> {
  const app = createApp({
    debug: options.debug ?? false,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
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
