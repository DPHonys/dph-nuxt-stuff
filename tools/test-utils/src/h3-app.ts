/**
 * Mounting tools for the handler suites: one real h3 app per request, so what
 * a suite observes is what a Nitro server would produce.
 */

import type { AppOptions, EventHandler, H3Error } from 'h3'
import { createApp, createRouter, toWebHandler } from 'h3'

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
 * A value the types never saw - what a plain-JavaScript route file or a wire
 * hands over - as its JSON. Parsing is the one honest source of such a value:
 * `any` here is `JSON.parse`'s own answer, where every other spelling would be
 * a cast telling the compiler a lie.
 */
export function wire(json: string): any {
  return JSON.parse(json)
}

/**
 * A value handed over as the types never saw it - what a cast, or a plain
 * JavaScript route file, produces for a shape `wire` cannot spell as JSON: a
 * function, a class instance. `any` is the honest spelling; a chained
 * assertion at every call site would say the same thing, less readably.
 */
export function untyped<T>(value: T): any {
  return value
}

/**
 * A POST carrying an already-serialized payload. Typed structurally rather
 * than as `RequestInit`, because it is handed to `fetch` and to ofetch's
 * `$fetch` alike.
 */
interface JsonPost {
  method: 'POST'
  headers: Record<string, string>
  body: string
}

/**
 * A POST carrying an already-serialized JSON payload, so a malformed one is as
 * easy to send as a valid one. The caller's headers land last.
 */
export function postJson(
  payload: string,
  headers: Record<string, string> = {}
): JsonPost {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  }
}
