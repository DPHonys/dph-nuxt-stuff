import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import type { $CheckedFetch } from '../types/fetch'
import { CHANNEL_HEADER } from './channel'
import type { RawTryResult } from './checked-fetch-factory'
import { toTryResult } from './checked-fetch-factory'

// Moved to the alias-free factory file so the Nitro internals can reach them
// without this file's channel-token binding; re-exported from here unchanged.
export { toNuxtError, toTryResult } from './checked-fetch-factory'
export type { RawTryResult } from './checked-fetch-factory'

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
  }) as $CheckedFetch
}

// `globalThis.$fetch` read at CALL time rather than captured, so the two
// installing plugins are a single assignment each rather than an ordering
// problem.
const vanilla = (): RawFetch => globalThis.$fetch as RawFetch

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
