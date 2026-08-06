/**
 * `$typedFetch` and `$typedFetch.safe` — the imperative surface at run time:
 * one header merge, one try/catch, one cast. Side-agnostic on purpose —
 * nothing here imports `#app`, which is what lets the value be installed as a
 * global on both sides. The type-level half lives in `../types`.
 *
 * Under `shared/` for that side-agnosticism, but deliberately absent from
 * `./index`: this value reaches call sites as `globalThis.$typedFetch`, never
 * through the published specifier.
 */

import type { $TypedFetch, AnyVariant } from '../types'
import { declaredError } from './reader'

// ---------------------------------------------------------------------------
// What this wrapper needs of the thing underneath it
// ---------------------------------------------------------------------------

/** The one option this wrapper reads. Everything else is forwarded untouched. */
interface RawOptions {
  headers?: HeadersInit
}

/**
 * Vanilla's namespace reduced to the three shapes this file touches.
 * Deliberately not `$Fetch` — the real interface would make every forwarding
 * call site fight route-literal inference. The claim that the wrapper really
 * is vanilla-shaped is made once, by the cast ending {@link createTypedFetch}.
 */
interface RawFetch {
  (request: unknown, opts?: RawOptions): Promise<unknown>
  raw: (request: unknown, opts?: RawOptions) => Promise<unknown>
  create: (defaults: RawOptions) => RawFetch
}

/** What {@link toTypedResult} answers, before the declared union is asserted on. */
export type RawTypedResult =
  | { ok: true; data: unknown }
  | { ok: false; error: AnyVariant }

// ---------------------------------------------------------------------------
// The header merge — the GLOBAL form
// ---------------------------------------------------------------------------

const ACCEPT = 'accept'

/**
 * Required on every request: without it Nitro's `isJsonRequest` falls back to
 * a path test that fails outside `/api/**` and under a non-root `app.baseURL`,
 * and a declared 403 arrives as an HTML string in `err.data`.
 */
const ACCEPT_JSON = 'application/json'

/**
 * The call's headers with `accept` added when neither the call nor the
 * instance defaults carry one — built through a `Headers` (the one merge that
 * accepts all three legal input forms; a naive spread drops a caller's
 * `Headers` instance and corrupts a tuple array) and handed on **as a
 * `Headers`**, because ofetch's `mergeHeaders` takes one correctly. The
 * design's three header merges are deliberately unshared: the event-bound
 * wrapper and the composable both reach h3's `fetchWithEvent`, which merges
 * by object spread, so they must flatten and this one must not.
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
 * The headers an instance's defaults carry after a `create`, mirroring
 * ofetch's own **shallow** defaults spread: a `headers` key replaces the
 * instance's wholesale. The obvious accumulate-across-creates spelling makes
 * `create({ headers: { accept } }).create({ headers: { authorization } })`
 * send no `accept` at all while this closure still believes it is there.
 */
function nextInstanceHeaders(current: Headers, defaults: RawOptions): Headers {
  return 'headers' in defaults ? new Headers(defaults.headers) : current
}

// ---------------------------------------------------------------------------
// The safe channel
// ---------------------------------------------------------------------------

/**
 * Run a call and answer the discriminated result — or **rethrow the original
 * error untouched**. `ok: false` means "a declared failure the route
 * promised"; the reader decides, and everything without the shape floor
 * rethrows. One function rather than inlined into `.safe`, because
 * `./server/event-typed-fetch` needs exactly this and a second copy could
 * drift — the rethrow suite is a claim about both surfaces at once.
 */
export async function toTypedResult(
  call: () => Promise<unknown>
): Promise<RawTypedResult> {
  try {
    return { ok: true, data: await call() }
  } catch (error) {
    const failure = declaredError(error)

    // Rethrowing the caught binding itself keeps a caller's existing `catch`
    // seeing precisely what vanilla would have given it — same instance, same
    // `status`, same `data`, same stack.
    if (failure === undefined) throw error

    return { ok: false, error: failure }
  }
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

/**
 * Build the typed namespace over a vanilla one. Every member forwards; only
 * the `accept` header and `.safe`'s try/catch are added. The final cast makes
 * two claims: a forwarding function inhabits vanilla's route-literal-inferring
 * signature (it forwards), and the floor the reader answered is a member of
 * the declared union — the documented deploy-skew tail, uncheckable on the
 * wire.
 */
export function createTypedFetch(
  base: RawFetch,
  instanceHeaders: Headers = new Headers()
): $TypedFetch {
  const call = (request: unknown, opts?: RawOptions): Promise<unknown> =>
    base(request, withAcceptJson(opts, instanceHeaders))

  return Object.assign(call, {
    safe: (request: unknown, opts?: RawOptions): Promise<RawTypedResult> =>
      toTypedResult(() => call(request, opts)),

    raw: (request: unknown, opts?: RawOptions): Promise<unknown> =>
      base.raw(request, withAcceptJson(opts, instanceHeaders)),

    create: (defaults: RawOptions): $TypedFetch =>
      createTypedFetch(
        base.create(defaults),
        nextInstanceHeaders(instanceHeaders, defaults)
      ),
  }) as unknown as $TypedFetch
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
  }
)

/**
 * The value the module installs on `globalThis` — built once, at module
 * scope, so both plugins assign the same object on every side.
 */
export const $typedFetch: $TypedFetch = createTypedFetch(vanillaGlobal)
