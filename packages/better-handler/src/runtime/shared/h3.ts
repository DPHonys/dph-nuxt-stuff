/**
 * The handler and error construction seam: the only file in the package that
 * builds an h3 handler or an h3 error. On h3 v2 (Nuxt 5) `defineEventHandler`
 * and `createError` become `defineHandler` and `HTTPError`, and only the
 * bodies below change.
 *
 * In `shared/` rather than `server/` because the client half constructs errors
 * too.
 */

import { createError, defineEventHandler } from 'h3'
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Error,
  H3Event,
} from 'h3'

// Neither name below is an h3 v2 export: Nuxt 5 auto-imports every lowercase
// one, and a name of ours that shadowed it would collide in every app.

/**
 * An h3 handler around `run`, typed with the caller's `Request` and
 * `Response`, so the handler type a route exports is decided by the caller,
 * not by h3's defaults.
 */
export function makeEventHandler<
  Request extends EventHandlerRequest,
  Response extends EventHandlerResponse,
>(run: (event: H3Event<Request>) => Response): EventHandler<Request, Response> {
  return defineEventHandler<Request, Response>(run)
}

/** What {@link httpError} builds an error from. */
export interface HttpErrorInput<Data> {
  readonly status: number
  readonly message: string
  /** The error's `data`, sent as the body's `data`; absent when omitted. */
  readonly data?: Data
  /**
   * What the error stands in for, kept as its `cause` for the logs and an
   * error hook; h3 never sends a cause.
   */
  readonly cause?: unknown
}

/**
 * Every HTTP error the package constructs: a Known error, whose `message` is
 * its tag and whose `data` is the tagged object, and a developer fault, which
 * has no `data`.
 *
 * `statusMessage` is never set: h3 copies it into a server-to-server fetch's
 * error untouched, so nothing of ours may ride the reason phrase. `fatal` and
 * `unhandled` are left at h3's `false`, so a production server still sends
 * `message` and `data`, and Nuxt never escalates the error to its error page.
 */
export function httpError<Data>(input: HttpErrorInput<Data>): H3Error<Data> {
  const fields: Partial<H3Error<Data>> = {
    statusCode: input.status,
    message: input.message,
  }

  if (input.data !== undefined) fields.data = input.data
  if (input.cause !== undefined) fields.cause = input.cause

  return createError<Data>(fields)
}
