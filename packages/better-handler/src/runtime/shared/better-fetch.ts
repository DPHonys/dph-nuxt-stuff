/**
 * `$betterFetch`: vanilla `$fetch` with `.try` and a JSON `accept` header,
 * typed from the generated maps. One object, installed on `globalThis` by a
 * client plugin and a Nitro plugin, each on its own side.
 */

import type { $BetterFetch } from '../types/fetch'
import { toTryResult } from './errors/try-result'

/** The one option this wrapper reads; everything else is forwarded untouched. */
export interface RawOptions {
  headers?: HeadersInit
}

/** What the wrapper forwards a call with: a request path, URL or `Request`. */
type RawRequest = string | Request

/**
 * Vanilla's namespace reduced to the members this file touches, with the
 * route-typed generics erased: the real `$Fetch` would make every forwarding
 * call fight route-literal inference. `Body` is what a call resolves to,
 * `Raw` what `.raw` resolves to, a `Response` on the real thing.
 */
export interface RawFetch<Body, Raw = Response> {
  (request: RawRequest, opts?: RawOptions): Promise<Body>
  raw: (request: RawRequest, opts?: RawOptions) => Promise<Raw>
  create: (defaults: RawOptions) => RawFetch<Body, Raw>
  native: typeof globalThis.fetch
}

const ACCEPT = 'accept'

// Nitro answers an error as JSON outside `/api/**` only for a request that
// asks for JSON; without the header a Known error from a `server/routes/`
// route arrives as an HTML page and is classified `request-failed`.
const ACCEPT_JSON = 'application/json'

// Built through a `Headers`, the one merge that accepts every form a caller
// may pass, and handed on as one: ofetch merges a `Headers` correctly. The
// event-bound fetch flattens instead, so the two merges stay apart. A caller's
// own `accept`, per call or per instance, wins.
function withAcceptJson(
  opts: RawOptions | undefined,
  instanceHeaders: Headers
): RawOptions {
  const headers = new Headers(opts?.headers)

  if (!headers.has(ACCEPT) && !instanceHeaders.has(ACCEPT)) {
    headers.set(ACCEPT, ACCEPT_JSON)
  }

  return { ...opts, headers }
}

// Mirrors ofetch's own shallow defaults spread: a `headers` key replaces the
// instance's wholesale, so accumulating across creates would drift from what
// ofetch sends.
function nextInstanceHeaders(current: Headers, defaults: RawOptions): Headers {
  return 'headers' in defaults ? new Headers(defaults.headers) : current
}

// Every member forwards to its namesake on `base`; only the header and
// `.try`'s classification are added.
function build<Body, Raw>(
  base: RawFetch<Body, Raw>,
  instanceHeaders: Headers
): $BetterFetch {
  const call = (request: RawRequest, opts?: RawOptions): Promise<Body> =>
    base(request, withAcceptJson(opts, instanceHeaders))

  const better = Object.assign(call, {
    try: (request: RawRequest, opts?: RawOptions) =>
      toTryResult(() => call(request, opts)),

    raw: (request: RawRequest, opts?: RawOptions): Promise<Raw> =>
      base.raw(request, withAcceptJson(opts, instanceHeaders)),

    native: (...args: Parameters<typeof globalThis.fetch>): Promise<Response> =>
      base.native(...args),

    create: (defaults: RawOptions): $BetterFetch =>
      build(
        base.create(defaults),
        nextInstanceHeaders(instanceHeaders, defaults)
      ),
  })

  // SAFETY: `$BetterFetch` is vanilla's route-typed namespace plus `.try`.
  // Every member above forwards to the same-named member of `base` with only
  // the `accept` header added, so the response types are the ones vanilla
  // `$fetch` already claims per route; `.try` resolves what the call resolves
  // or classifies what it rejects with through `toTryResult`, whose error is
  // the route's Known error read off the body, or the Request-failed variant.
  // The request-side types only narrow what a caller may pass.
  return better as $BetterFetch
}

/** Wrap a vanilla `$fetch` instance as a `$betterFetch` instance. */
export function createBetterFetch<Body, Raw>(
  base: RawFetch<Body, Raw>
): $BetterFetch {
  return build(base, new Headers())
}

/**
 * `globalThis.$fetch`, read at call time rather than captured, so the global
 * can be built before either side installs `$fetch`. `create` reads it once,
 * when called: the instance it returns is bound to that moment's `$fetch`.
 */
// SAFETY: `globalThis.$fetch` is ofetch's instance, which carries `native` at
// runtime while Nitro's `$Fetch` declaration omits it; `RawFetch<unknown>` is
// that same object with the route-typed generics erased.
const vanilla = (): RawFetch<unknown> => globalThis.$fetch as RawFetch<unknown>

/** A `RawFetch` over whatever `globalThis.$fetch` is when it is called. */
export const lazyGlobalFetch: RawFetch<unknown> = Object.assign(
  (request: RawRequest, opts?: RawOptions) => vanilla()(request, opts),
  {
    raw: (request: RawRequest, opts?: RawOptions): Promise<Response> =>
      vanilla().raw(request, opts),

    create: (defaults: RawOptions): RawFetch<unknown> =>
      vanilla().create(defaults),

    native: (...args: Parameters<typeof globalThis.fetch>): Promise<Response> =>
      vanilla().native(...args),
  }
)

/** The value both plugins install: one object on every side. */
export const $betterFetch: $BetterFetch = createBetterFetch(lazyGlobalFetch)

/** What both global plugins do: put `$betterFetch` on their side's `globalThis`. */
export function installBetterFetchGlobal(): void {
  globalThis.$betterFetch = $betterFetch
}
