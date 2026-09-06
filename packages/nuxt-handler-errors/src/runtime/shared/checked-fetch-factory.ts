import { createError } from 'h3'
import type { NitroFetchRequest } from 'nitropack/types'
import type { NuxtError } from 'nuxt/app'
import * as v from 'valibot'
import type { $CheckedFetch, TryResult } from '../types/fetch'
import { CHANNEL_HEADER } from './channel'
import type { PlainObject } from './plain-object'
import { isPlainObject } from './plain-object'

export type RawTryResult = TryResult<unknown, NuxtError>

/** The one option this wrapper reads. Everything else is forwarded untouched. */
export interface RawOptions {
  headers?: HeadersInit
}

// Vanilla's namespace reduced to the shapes this file touches - the real
// `$Fetch` would make every forwarding call site fight route-literal
// inference. `Body` is the instance-level claim ofetch itself makes as
// `$Fetch<DefaultT>`; `Raw` is what `.raw` resolves, a `Response` on the
// real thing. The cast ending `build` makes the route-typed claim once.
export interface RawFetch<Body, Raw = Response> {
  (request: NitroFetchRequest, opts?: RawOptions): Promise<Body>
  raw: (request: NitroFetchRequest, opts?: RawOptions) => Promise<Raw>
  create: (defaults: RawOptions) => RawFetch<Body, Raw>
  native: typeof globalThis.fetch
}

export interface CheckedFetchFactoryOptions {
  /** Read on every call, never captured - a binding may hand in a getter. */
  readonly token: string | undefined
  /** What `create(defaults)` threads through; defaults to empty. */
  readonly instanceHeaders?: Headers
}

// What h3's `createError` reads: a message, or an object it copies the error
// fields off. An array is an object to h3 but carries no field it reads, so
// it is stringified like any other primitive.
function isErrorInput(cause: unknown): cause is string | PlainObject {
  return v.is(v.string(), cause) || isPlainObject(cause)
}

// h3's `createError` - the same normalisation `useFetch`'s error ref goes
// through, so one matcher serves both surfaces at one depth.
export function toNuxtError(cause: unknown): NuxtError {
  // `createError(null)` reads `input.message` and throws, and `.try` must be
  // total - a thrown `null` is a failure like any other.
  const error = createError(
    isErrorInput(cause) ? cause : { message: String(cause) }
  )

  // A bare `H3Error` sets only `statusCode`; the `NuxtError` face this hands
  // out has to be runtime-true on the server as well.
  if (!('status' in error)) {
    Object.defineProperty(error, 'status', {
      get: () => error.statusCode,
      configurable: true,
    })
  }

  if (!('statusText' in error)) {
    Object.defineProperty(error, 'statusText', {
      get: () => error.statusMessage,
      configurable: true,
    })
  }

  return error
}

// Catches everything a fetch can throw - HTTP, network, abort, parse - and
// normalises it; there is no rethrow channel.
export async function toTryResult<T>(
  call: () => Promise<T>
): Promise<TryResult<T, NuxtError>> {
  try {
    return { data: await call(), error: undefined }
  } catch (cause) {
    return { data: undefined, error: toNuxtError(cause) }
  }
}

const ACCEPT = 'accept'

// Without `accept`, Nitro's `isJsonRequest` falls back to a path test that
// fails outside `/api/**`, and a declared 403 arrives as an HTML string.
const ACCEPT_JSON = 'application/json'

// Built through a `Headers` (the one merge that accepts all three legal input
// forms) and handed on AS a `Headers` - ofetch's `mergeHeaders` takes one
// correctly. The event-bound wrapper and the composable must flatten instead;
// the three merges are deliberately unshared.
function withCheckedHeaders(
  opts: RawOptions | undefined,
  instanceHeaders: Headers,
  token: string | undefined
): RawOptions {
  const headers = new Headers(opts?.headers)

  if (!headers.has(ACCEPT) && !instanceHeaders.has(ACCEPT)) {
    headers.set(ACCEPT, ACCEPT_JSON)
  }

  if (token !== undefined) {
    headers.set(CHANNEL_HEADER, token)
  }

  return { ...opts, headers }
}

// Mirrors ofetch's own SHALLOW defaults spread: a `headers` key replaces the
// instance's wholesale - accumulating across creates would drift from what
// ofetch actually sends.
function nextInstanceHeaders(current: Headers, defaults: RawOptions): Headers {
  return 'headers' in defaults ? new Headers(defaults.headers) : current
}

// Every member forwards; only the headers and `.try`'s try/catch are added.
// `options` goes down whole, not spread, so a getter-backed `token` stays live.
function build<Body, Raw>(
  base: RawFetch<Body, Raw>,
  options: CheckedFetchFactoryOptions,
  instanceHeaders: Headers
): $CheckedFetch {
  const call = (request: NitroFetchRequest, opts?: RawOptions): Promise<Body> =>
    base(request, withCheckedHeaders(opts, instanceHeaders, options.token))

  const checked = Object.assign(call, {
    try: (
      request: NitroFetchRequest,
      opts?: RawOptions
    ): Promise<TryResult<Body, NuxtError>> =>
      toTryResult(() => call(request, opts)),

    raw: (request: NitroFetchRequest, opts?: RawOptions): Promise<Raw> =>
      base.raw(
        request,
        withCheckedHeaders(opts, instanceHeaders, options.token)
      ),

    native: (...args: Parameters<typeof globalThis.fetch>): Promise<Response> =>
      base.native(...args),

    create: (defaults: RawOptions): $CheckedFetch =>
      build(
        base.create(defaults),
        options,
        nextInstanceHeaders(instanceHeaders, defaults)
      ),
  })

  // SAFETY: `$CheckedFetch` is vanilla's own route-typed namespace plus
  // `.try`. Every member above forwards to the same-named member of `base`
  // with only headers added, and `.try` wraps the call in `toTryResult`, so
  // the route-typed claims are exactly the ones the underlying `$fetch`
  // already makes; `Body` and `Raw` are that instance's own claims, restated
  // per route by the overloads.
  return checked as $CheckedFetch
}

export function createCheckedFetch<Body, Raw>(
  base: RawFetch<Body, Raw>,
  options: CheckedFetchFactoryOptions
): $CheckedFetch {
  return build(base, options, options.instanceHeaders ?? new Headers())
}

// `globalThis.$fetch` read at CALL time rather than captured, so the two
// installing plugins are a single assignment each rather than an ordering
// problem. `create` resolves it once, when called: the returned instance is
// bound to that moment's `$fetch`.
// `$Fetch<unknown>` is what Nitro declares for the global - the body is
// route-typed per call and nothing at the instance level.
type GlobalFetch = RawFetch<unknown>

// SAFETY: `globalThis.$fetch` is ofetch's instance, which carries `native`
// at runtime while Nitro's `$Fetch` declaration omits it; `GlobalFetch` is
// that same object with the route-typed response generics erased.
const vanilla = (): GlobalFetch => globalThis.$fetch as GlobalFetch

/** Lets a module layer build its global before `$fetch` is installed. */
export const lazyGlobalFetch: GlobalFetch = Object.assign(
  (request: NitroFetchRequest, opts?: RawOptions) => vanilla()(request, opts),
  {
    raw: (request: NitroFetchRequest, opts?: RawOptions): Promise<Response> =>
      vanilla().raw(request, opts),

    create: (defaults: RawOptions): GlobalFetch => vanilla().create(defaults),

    native: (...args: Parameters<typeof globalThis.fetch>): Promise<Response> =>
      vanilla().native(...args),
  }
)
