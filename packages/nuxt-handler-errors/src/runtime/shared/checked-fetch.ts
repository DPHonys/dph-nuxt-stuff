import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { createError } from 'h3'
import type { NuxtError } from 'nuxt/app'
import type { $CheckedFetch, TryResult } from '../types/fetch'
import { CHANNEL_HEADER } from './channel'

/** The one option this wrapper reads. Everything else is forwarded untouched. */
interface RawOptions {
  headers?: HeadersInit
}

// Vanilla's namespace reduced to the shapes this file touches - the real
// `$Fetch` would make every forwarding call site fight route-literal
// inference. The cast ending `createCheckedFetch` makes the claim once.
interface RawFetch {
  (request: unknown, opts?: RawOptions): Promise<unknown>
  raw: (request: unknown, opts?: RawOptions) => Promise<unknown>
  create: (defaults: RawOptions) => RawFetch
  native: typeof globalThis.fetch
}

export type RawTryResult = TryResult<unknown, NuxtError>

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
  instanceHeaders: Headers
): RawOptions {
  const headers = new Headers(opts?.headers)

  if (!headers.has(ACCEPT) && !instanceHeaders.has(ACCEPT)) {
    headers.set(ACCEPT, ACCEPT_JSON)
  }

  if (configuredChannelToken !== undefined) {
    headers.set(CHANNEL_HEADER, configuredChannelToken)
  }

  return { ...opts, headers }
}

// Mirrors ofetch's own SHALLOW defaults spread: a `headers` key replaces the
// instance's wholesale - accumulating across creates would drift from what
// ofetch actually sends.
function nextInstanceHeaders(current: Headers, defaults: RawOptions): Headers {
  return 'headers' in defaults ? new Headers(defaults.headers) : current
}

// h3's `createError` - the same normalisation `useFetch`'s error ref goes
// through, so one matcher serves both surfaces at one depth.
export function toNuxtError(cause: unknown): NuxtError {
  // `createError(null)` reads `input.message` and throws, and `.try` must be
  // total - a thrown `null` is a failure like any other.
  const input =
    typeof cause === 'string' ||
    (typeof cause === 'object' && cause !== null && !Array.isArray(cause))
      ? cause
      : { message: String(cause) }

  const error = createError(input as Parameters<typeof createError>[0])

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

  return error as NuxtError
}

// Catches everything a fetch can throw - HTTP, network, abort, parse - and
// normalises it; there is no rethrow channel.
export async function toTryResult(
  call: () => Promise<unknown>
): Promise<RawTryResult> {
  try {
    return { data: await call(), error: undefined }
  } catch (cause) {
    return { data: undefined, error: toNuxtError(cause) }
  }
}

// Every member forwards; only the headers and `.try`'s try/catch are added.
export function createCheckedFetch(
  base: RawFetch,
  instanceHeaders: Headers = new Headers()
): $CheckedFetch {
  const call = (request: unknown, opts?: RawOptions): Promise<unknown> =>
    base(request, withCheckedHeaders(opts, instanceHeaders))

  return Object.assign(call, {
    try: (request: unknown, opts?: RawOptions): Promise<RawTryResult> =>
      toTryResult(() => call(request, opts)),

    raw: (request: unknown, opts?: RawOptions): Promise<unknown> =>
      base.raw(request, withCheckedHeaders(opts, instanceHeaders)),

    native: (...args: Parameters<typeof globalThis.fetch>): Promise<Response> =>
      base.native(...args),

    create: (defaults: RawOptions): $CheckedFetch =>
      createCheckedFetch(
        base.create(defaults),
        nextInstanceHeaders(instanceHeaders, defaults)
      ),
  }) as unknown as $CheckedFetch
}

// `globalThis.$fetch` read at CALL time rather than captured, so the two
// installing plugins are a single assignment each rather than an ordering
// problem.
const vanilla = (): RawFetch => globalThis.$fetch as unknown as RawFetch

const vanillaGlobal: RawFetch = Object.assign(
  (request: unknown, opts?: RawOptions): Promise<unknown> =>
    vanilla()(request, opts),
  {
    raw: (request: unknown, opts?: RawOptions): Promise<unknown> =>
      vanilla().raw(request, opts),

    create: (defaults: RawOptions): RawFetch => vanilla().create(defaults),

    native: (...args: Parameters<typeof globalThis.fetch>): Promise<Response> =>
      vanilla().native(...args),
  }
)

/** The value the module installs on `globalThis` - one object on every side. */
export const $checkedFetch: $CheckedFetch = createCheckedFetch(vanillaGlobal)
