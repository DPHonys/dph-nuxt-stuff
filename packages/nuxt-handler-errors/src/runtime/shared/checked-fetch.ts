/**
 * `$checkedFetch` and `$checkedFetch.try` at run time: one header merge, one
 * try/catch, one cast. Side-agnostic on purpose — nothing here imports `#app`,
 * which is what lets the value be installed as a global on both sides. The
 * type-level half lives in `../types/fetch`.
 *
 * Under `shared/` for that side-agnosticism, but deliberately absent from
 * `./index`: this value reaches call sites as `globalThis.$checkedFetch`, never
 * through the published specifier.
 */

import { createError } from 'h3'
import type { NuxtError } from 'nuxt/app'
import type { $CheckedFetch, TryResult } from '../types/fetch'

// ---------------------------------------------------------------------------
// What this wrapper needs of the thing underneath it
// ---------------------------------------------------------------------------

/** The one option this wrapper reads. Everything else is forwarded untouched. */
interface RawOptions {
  headers?: HeadersInit
}

/**
 * Vanilla's namespace reduced to the shapes this file touches. Deliberately not
 * `$Fetch` — the real interface would make every forwarding call site fight
 * route-literal inference. The claim that the wrapper really is vanilla-shaped
 * is made once, by the cast ending {@link createCheckedFetch}.
 */
interface RawFetch {
  (request: unknown, opts?: RawOptions): Promise<unknown>
  raw: (request: unknown, opts?: RawOptions) => Promise<unknown>
  create: (defaults: RawOptions) => RawFetch
  native: typeof globalThis.fetch
}

/** What {@link toTryResult} answers, before the declared union is asserted on. */
export type RawTryResult = TryResult<unknown, NuxtError>

// ---------------------------------------------------------------------------
// The header merge — the GLOBAL form
// ---------------------------------------------------------------------------

const ACCEPT = 'accept'

/**
 * Required on every request: without it Nitro's `isJsonRequest` falls back to a
 * path test that fails outside `/api/**` and under a non-root `app.baseURL`,
 * and a declared 403 arrives as an HTML string in `err.data`. ofetch never
 * rescues it — 1.5.1 has no `accept` logic at all, and 2.0.0-alpha sets it only
 * for payload methods, so GETs still miss it.
 */
const ACCEPT_JSON = 'application/json'

/**
 * The call's headers with `accept` added when neither the call nor the instance
 * defaults carry one — built through a `Headers` (the one merge that accepts
 * all three legal input forms; a naive spread drops a caller's `Headers`
 * instance and corrupts a tuple array) and handed on **as a `Headers`**,
 * because ofetch's `mergeHeaders` takes one correctly.
 *
 * The three header merges are deliberately unshared: the event-bound wrapper
 * and the composable both reach h3's `fetchWithEvent`, which merges by object
 * spread, so they must flatten and this one must not.
 */
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

/**
 * The headers an instance's defaults carry after a `create`, mirroring ofetch's
 * own **shallow** defaults spread: a `headers` key replaces the instance's
 * wholesale. The obvious accumulate-across-creates spelling makes
 * `create({ headers: { accept } }).create({ headers: { authorization } })` send
 * no `accept` at all while this closure still believes it is there.
 */
function nextInstanceHeaders(current: Headers, defaults: RawOptions): Headers {
  return 'headers' in defaults ? new Headers(defaults.headers) : current
}

// ---------------------------------------------------------------------------
// The `.try` channel
// ---------------------------------------------------------------------------

/**
 * Whatever was thrown, as the framework's error object — h3's `createError`,
 * which is what `useFetch`'s error ref goes through, so one matcher serves both
 * surfaces at one depth. `createError` short-circuits on an error it already
 * made, and copies `data` across from anything else (an ofetch `FetchError`'s
 * `data` getter is the parsed callee body), so the variant lands at
 * `error.data.data.__knownError__` either way.
 *
 * The non-object guard is this file's, not h3's: `createError(null)` reads
 * `input.message` and throws, and `.try` must be total — a thrown `null` is a
 * failure like any other.
 */
export function toNuxtError(cause: unknown): NuxtError {
  const input =
    typeof cause === 'string' ||
    (typeof cause === 'object' && cause !== null && !Array.isArray(cause))
      ? cause
      : { message: String(cause) }

  const error = createError(input as Parameters<typeof createError>[0])

  // **The standing requirement.** A bare `H3Error` sets only `statusCode`, and
  // `status` is the one word for the status on both layers — Nuxt's own
  // `createError` defines exactly these two getters, and the `NuxtError` face
  // this hands out has to be runtime-true on the server as well.
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

/**
 * Run a call and answer the discriminated result. **Catches everything** a
 * fetch can throw — HTTP, network, abort, parse — and normalises it; there is
 * no rethrow channel, because `error`'s presence is the discriminant and a
 * caller that got neither arm would have no way to ask what happened.
 *
 * One function rather than one inlined into each surface: the event-bound
 * wrapper needs exactly this, and a second copy could drift while both suites
 * kept passing.
 */
export async function toTryResult(
  call: () => Promise<unknown>
): Promise<RawTryResult> {
  try {
    return { data: await call(), error: undefined }
  } catch (cause) {
    return { data: undefined, error: toNuxtError(cause) }
  }
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

/**
 * Build the checked namespace over a vanilla one. Every member forwards; only
 * the `accept` header and `.try`'s try/catch are added. The final cast claims
 * that a forwarding function inhabits vanilla's route-literal-inferring
 * signature — it forwards — and that the carrier it hands out belongs to the
 * route's declared union, the documented deploy-skew tail that is uncheckable
 * on the wire.
 */
export function createCheckedFetch(
  base: RawFetch,
  instanceHeaders: Headers = new Headers()
): $CheckedFetch {
  const call = (request: unknown, opts?: RawOptions): Promise<unknown> =>
    base(request, withAcceptJson(opts, instanceHeaders))

  return Object.assign(call, {
    try: (request: unknown, opts?: RawOptions): Promise<RawTryResult> =>
      toTryResult(() => call(request, opts)),

    raw: (request: unknown, opts?: RawOptions): Promise<unknown> =>
      base.raw(request, withAcceptJson(opts, instanceHeaders)),

    native: (...args: Parameters<typeof globalThis.fetch>): Promise<Response> =>
      base.native(...args),

    create: (defaults: RawOptions): $CheckedFetch =>
      createCheckedFetch(
        base.create(defaults),
        nextInstanceHeaders(instanceHeaders, defaults)
      ),
  }) as unknown as $CheckedFetch
}

/**
 * `globalThis.$fetch`, read at **call** time rather than captured, so the two
 * installing plugins are a single assignment each rather than an ordering
 * problem.
 */
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

/**
 * The value the module installs on `globalThis` — built once, at module scope,
 * so both plugins assign the same object on every side.
 */
export const $checkedFetch: $CheckedFetch = createCheckedFetch(vanillaGlobal)
