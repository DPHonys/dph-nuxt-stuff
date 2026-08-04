/**
 * `$typedFetch` and `$typedFetch.safe` — the imperative surface
 * (SPEC.md §3.5).
 *
 * Side-agnostic on purpose: nothing here imports `#app`, so this file loads in
 * the browser, inside Nitro and from a consumer's `shared/` directory alike.
 * That is what lets the value be installed as a **global**, the way Nitro
 * installs its own `$fetch`, rather than as an import a call site has to know
 * about.
 *
 * ## Where the two behaviours are documented
 *
 * The type-level half — why both a throwing and a returning form ship, why the
 * undeclared collapse is mandatory, and why the namespace is a full mirror —
 * lives on {@link $TypedFetch}, {@link TypedFetchSafe} and {@link TypedResult}
 * in `./types`. This file is the run time: one header merge, one try/catch, and
 * one cast.
 */

import { declaredError } from './shared'
import type { $TypedFetch, AnyVariant } from './types'

// ---------------------------------------------------------------------------
// What this wrapper needs of the thing underneath it
// ---------------------------------------------------------------------------

/** The one option this wrapper reads. Everything else is forwarded untouched. */
interface RawOptions {
  headers?: HeadersInit
}

/**
 * Vanilla's namespace reduced to the three shapes this file touches.
 *
 * Deliberately not `$Fetch`: typing the parameter as Nitro's own interface
 * would make every internal call site fight route-literal inference for no
 * gain, since the wrapper forwards whatever it was handed. The claim that the
 * wrapper's signature really is vanilla's is made once, by the cast at the end
 * of {@link createTypedFetch}.
 */
interface RawFetch {
  (request: unknown, opts?: RawOptions): Promise<unknown>
  raw: (request: unknown, opts?: RawOptions) => Promise<unknown>
  create: (defaults: RawOptions) => RawFetch
}

/** What {@link toTypedResult} answers, before the declared union is asserted on. */
type RawTypedResult =
  | { ok: true; data: unknown }
  | { ok: false; error: AnyVariant }

// ---------------------------------------------------------------------------
// The header merge — the GLOBAL form (SPEC.md §3.8)
// ---------------------------------------------------------------------------

const ACCEPT = 'accept'

/**
 * Every request this module makes must carry `accept: application/json`
 * (SPEC.md §3.8).
 *
 * Nitro's `isJsonRequest` heuristic decides whether an error comes back as JSON
 * or as a rendered HTML error page, and its last resort is
 * `event.path.startsWith('/api/')` — which fails for every route outside
 * `/api/**` and for every route under a non-root `app.baseURL`, since ofetch
 * prefixes it and `/shop/api/x` does not pass the test. Lose the header and a
 * declared 403 arrives as an HTML string in `err.data`.
 */
const ACCEPT_JSON = 'application/json'

/**
 * The call's headers with `accept` added when neither the call nor the
 * instance defaults already carry one — built through a `Headers` and handed on
 * **as a `Headers`**.
 *
 * ## Why a `Headers`, and why it is not flattened
 *
 * SPEC.md §3.8 puts three merges in this design, and its own title says that
 * one shared helper across them would be a defect. This is the global one, and
 * it is the only surface where §3.8's rule can be followed literally:
 *
 * - **Naive spreading is a shipped-defect-class bug.** A caller passing
 *   `new Headers({ authorization: … })` — a legal, common form — has no own
 *   enumerable properties, so `{ accept, ...opts.headers }` silently drops
 *   every header they set, and a tuple array spreads to `{"0": […]}` and is
 *   corrupted outright. `new Headers(init)` is the one merge that accepts all
 *   three input shapes and `has('accept')` the one check that sees a caller's
 *   own `accept` in all three.
 * - **It is handed on whole.** What sits underneath here is an ofetch instance,
 *   whose `mergeHeaders` takes a `Headers` correctly. The *event-bound* wrapper
 *   (SPEC.md §3.6) reaches h3's `fetchWithEvent` instead, which merges by
 *   **object spread** — a `Headers` spreads to nothing there, so that surface
 *   must flatten with `Object.fromEntries` and this one must not. The composable
 *   is a third case again: `useFetch` swaps in `useRequestFetch()` for
 *   same-origin SSR requests, so it reaches `fetchWithEvent` too and flattens
 *   (SPEC-AMENDMENTS item 30). Three surfaces, three merges, and the correct fix
 *   for one is wrong for the others.
 *
 * ## The instance half of the rule
 *
 * SPEC.md §3.8's global rule is *set `accept` only when neither the call nor
 * the instance defaults carry it*, and names `create`'s closure as what checks
 * the second half. {@link createTypedFetch} keeps its own accumulated default
 * headers for exactly this, so an instance-level `accept` is honoured — and a
 * call-level one still beats it, because ofetch's `mergeHeaders(input,
 * defaults)` gives call headers precedence and this merge never touches an
 * `accept` that is already there.
 *
 * No refs are unwrapped here, unlike the composable's merge. Vanilla's option
 * type on *this* surface is ofetch's plain `FetchOptions`, whose `headers` is a
 * `HeadersInit` and nothing reactive.
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
 * The headers an instance's defaults carry after a `create`, **modelled on what
 * ofetch actually does with them**.
 *
 * ```js
 * $fetch.create = (defaultOptions = {}, customGlobalOptions = {}) =>
 *   createFetch({ …, defaults: { …globalOptions.defaults,
 *                                …customGlobalOptions.defaults,
 *                                …defaultOptions } })
 * ```
 *
 * — `ofetch@1.5.1 dist/shared/ofetch.CWycOUEr.mjs:337`. That is a **shallow**
 * spread, so a `headers` key in the new defaults replaces the instance's
 * wholesale and a `create` that names no headers at all leaves them alone.
 * Mirroring it exactly is not fastidiousness: this closure exists only to
 * answer *"do the instance defaults already carry an `accept`?"*, and an answer
 * that disagrees with ofetch produces the one outcome SPEC.md §3.8 exists to
 * prevent. Accumulating across nested creates — the obvious spelling, and the
 * one written first — makes
 * `create({ headers: { accept } }).create({ headers: { authorization } })` send
 * **no `accept` at all**: ofetch has dropped the outer header and this closure
 * still believes it is there.
 */
function nextInstanceHeaders(current: Headers, defaults: RawOptions): Headers {
  return 'headers' in defaults ? new Headers(defaults.headers) : current
}

// ---------------------------------------------------------------------------
// The safe channel (SPEC.md §3.5)
// ---------------------------------------------------------------------------

/**
 * Run a call and answer the discriminated result — or **rethrow the original
 * error untouched**.
 *
 * This is the whole of `.safe`'s behavioural contract and it is deliberately
 * one function: `ok: false` means *"a declared failure the route promised"* and
 * nothing else may produce it. A 500, a timeout, a network drop, an aborted
 * request, a thrown string and a route that declares nothing all leave through
 * `throw`, exactly as they do through vanilla `$fetch` — so a caller who
 * already had a `catch` keeps needing it, and `.safe` adds a branch without
 * removing one.
 *
 * The reader (SPEC.md §3.7) is the only thing that decides. It answers
 * `undefined` for anything without SPEC.md §5.3's shape floor under the frozen
 * wire key, which covers all three of *no marker at all*, *a malformed marker*
 * and *a production-stripped response* (SPEC.md §6.5) — and every one of those
 * is rethrown rather than reported as a declared failure. The conservative
 * direction is the throwing one.
 *
 * Kept as one function rather than inlined into `.safe` because SPEC.md §3.6's
 * `event.$typedFetch` will need exactly this and must not grow a second copy:
 * the header merges on the two surfaces genuinely differ, but the rule about
 * what may reach the false arm does not. It stays **unexported** until that
 * surface exists — an export with no consumer is a public name bought on
 * speculation (SPEC.md §8.1).
 */
async function toTypedResult(
  call: () => Promise<unknown>
): Promise<RawTypedResult> {
  try {
    return { ok: true, data: await call() }
  } catch (error) {
    const failure = declaredError(error)

    // Not a declared failure. Rethrowing the caught binding rather than
    // anything derived from it is what keeps a caller's existing `catch`
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
 * Build the typed namespace over a vanilla one (SPEC.md §3.5).
 *
 * Every member forwards. The only things added anywhere are the `accept`
 * header and, on `.safe`, the try/catch — which is what *"adds typings only"*
 * has to mean at run time for the default entry point to stay a byte-for-byte
 * mirror of vanilla.
 *
 * **SPEC.md §3.5's one unavoidable cast is the last line.** (The other cast in
 * this file, in `vanilla` below, is the opposite kind: it *erases* a type this
 * module already knows, to keep route-literal inference out of an internal
 * forwarding path.) It makes exactly two claims, and this is the correct frame
 * for both — the module's own, not a call site's:
 *
 * 1. that a forwarding `(request, opts) => Promise<unknown>` inhabits vanilla's
 *    route-literal-inferring signature, which it does because it forwards; and
 * 2. that the {@link AnyVariant} floor the reader answered is a member of the
 *    route's declared union. Nothing on the wire could re-check that (the map
 *    is type-level only, SPEC.md §4.4), and it is exactly where SPEC.md §6.4's
 *    documented deploy-skew tail lives: a tag a client's generated union does
 *    not know comes back typed as a member it is not.
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
 * `globalThis.$fetch`, read at **call** time rather than captured.
 *
 * Nitro assigns its global inside `createNitroApp`, and Nuxt assigns the
 * browser's during app creation. Reading through a thunk means this module can
 * be imported at any point in either sequence and still wrap the real thing —
 * which is what lets the two installing plugins be a single assignment each
 * rather than an ordering problem.
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
 * The value the module installs on `globalThis` (SPEC.md §3.5).
 *
 * ```ts
 * const user = await $typedFetch('/api/users/123')        // throws, as $fetch does
 * const r    = await $typedFetch.safe('/api/users/123')   // returns the declared union
 * if (!r.ok) {
 *   switch (r.error.tag) { … }
 * }
 * ```
 *
 * Built once, at module scope, so the two plugins that install it assign the
 * same object on every side and on every request.
 */
export const $typedFetch: $TypedFetch = createTypedFetch(vanillaGlobal)
