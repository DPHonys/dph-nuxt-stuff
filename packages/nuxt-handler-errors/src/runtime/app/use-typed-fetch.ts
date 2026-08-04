/**
 * `useTypedFetch` / `useLazyTypedFetch` — the composable a component author
 * reaches for (SPEC.md §3.4).
 *
 * It behaves exactly like vanilla's fetch composable and **adds typings only**:
 * same arguments, same options, same completions, same error channel. The one
 * thing that moves is the error ref's payload — on a route that declared
 * failures, `error.value.data` is the declared envelope, and the reader from
 * SPEC.md §3.7 recovers the union out of it in one named call.
 *
 * ## Why this file is not on a published specifier
 *
 * SPEC.md §3 publishes exactly three: `.` (import-protected in app code),
 * `./types` (type-only) and `./shared` (side-agnostic). This composable calls
 * `useFetch`, which lives behind `#app` — an alias that exists in the **app**
 * build only. Putting it on `/shared` would put an unresolvable import into
 * every Nitro bundle that imports the reader, which SPEC-AMENDMENTS item 25
 * measured as a real production build and must stay working. So the contract
 * here is Nuxt's own auto-import contract: the module registers both names with
 * `addImports`, and a call site that wants an explicit import writes
 * `import { useTypedFetch } from '#imports'`. Recorded as SPEC-AMENDMENTS
 * item 29 — SPEC.md §3.7's *"the hand-writable specifier is the contract"* rule
 * is not satisfiable for a composable that must reach `#app`.
 *
 * ## The four type-level mandates, and where each lives
 *
 * - **The `ErrorT` slot is deleted, not reordered** — see {@link UseTypedFetch}.
 * - **The undeclared collapse** — see {@link TypedErrorRef}.
 * - **The envelope, not a bare union** — see {@link TypedErrorRef}.
 * - **The union is flattened before it enters the envelope's generic position**
 *   — see {@link TypedErrorRef}, where *which* position turns out to be the
 *   whole of it.
 */

import type { RouterMethod } from 'h3'
import type { AvailableRouterMethod, NitroFetchRequest } from 'nitropack/types'
import { computed, toValue } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useFetch, useLazyFetch } from '#app'
import type { AsyncData, FetchResult, NuxtError, UseFetchOptions } from '#app'
import type { KeysOf, PickFrom } from '#app/composables/asyncData'
import type { UseFetchOptionsWithTransform } from '#app/composables/fetch'
import type {
  AnyVariant,
  DeclaredErrorBody,
  DeclaredErrorsOf,
  Flatten,
} from '../types'

// ---------------------------------------------------------------------------
// The error type
// ---------------------------------------------------------------------------

/**
 * Exactly vanilla's own method set for a request: the route's available
 * methods in either case (`nuxt/dist/app/composables/fetch.d.ts:8`).
 */
type RouteMethod<R extends NitroFetchRequest> =
  | AvailableRouterMethod<R>
  | Uppercase<AvailableRouterMethod<R>>

/**
 * The declared union for a call, computed from the request and the method
 * alone (SPEC.md §4.3).
 *
 * Two guards, and neither is decoration:
 *
 * - **`ReqT extends string`** because `NitroFetchRequest` also admits a
 *   `Request` object, which no route path can be read out of. A non-string
 *   request is an undeclared route by construction.
 * - **`Method extends RouterMethod | Uppercase<RouterMethod>`** because that is
 *   {@link DeclaredErrorsOf}'s constraint, and the true branch is where the
 *   compiler will accept `Method` in that position. SPEC-AMENDMENTS item 19
 *   measured the alternatives: a naked `M extends AvailableRouterMethod<R>`
 *   satisfies it, a raw `Exclude<O['method'], undefined>` does **not**.
 *
 * Nothing here touches the data type, which is why SPEC.md §3.4's *"every
 * vanilla option carries over verbatim"* is a property of the shape rather than
 * a promise: `transform`, `pick`, `default`, `lazy`, `watch` and `immediate`
 * cannot interact with an error computed from two things none of them appear
 * in.
 */
type DeclaredErrorsFor<ReqT, Method> = ReqT extends string
  ? Method extends RouterMethod | Uppercase<RouterMethod>
    ? DeclaredErrorsOf<ReqT, Method>
    : never
  : never

/**
 * What the composable's `error` ref holds.
 *
 * **The ref keeps holding the framework's error object.** The wrapper never
 * replaces it at run time — Nuxt's `useAsyncData` unconditionally runs
 * `asyncData.error.value = createError(error)` — so declaring a bare tagged
 * union here would type-check while lying. The honest declaration is the
 * **envelope**, with the union nested inside where the wire really puts it
 * (SPEC.md §3.4, §5.1).
 *
 * **The undeclared collapse is mandatory** (SPEC.md §6.1). `NuxtError<never>`
 * is *narrower* than vanilla's `NuxtError<unknown>`: it leaves
 * `error.value.data` uninhabited, so a route that never opted in would be
 * strictly worse through this wrapper than through `useFetch`. That is the
 * degradation lock, and `never`'s absorbing behaviour does not propagate
 * outward through a wrapper type on its own — hence the explicit, tuple-wrapped
 * check.
 *
 * **`Flatten` is mandatory here, and *where* it is written is the whole of it**
 * (SPEC.md §8.3(a)). The union arrives out of the generated map as
 * `Simplify<Serialize<…>>`; forwarded into `DeclaredErrorBody` unflattened, the
 * printer renders the wrapper's `SerializeObject` residue rather than the
 * variants, and this is the hover a caller lands on first. Measured against the
 * real playground map, through this composable:
 *
 * | spelling | rendered |
 * | --- | --- |
 * | `Extract<Flatten<Declared>, AnyVariant>` — shipped | **212**, flat |
 * | `Extract<Declared, AnyVariant>` | **371**, `Simplify<SerializeObject<…>>` |
 * | `Flatten` passed in as the `Declared` argument instead | 380, residue |
 *
 * Row 3 is why SPEC-AMENDMENTS items 4 and 23 measured the opposite and
 * concluded the mandate does not reproduce: `Flatten` applied *as a type
 * argument*, or written by hand in the annotation being rendered, keeps its own
 * alias reference and the printer echoes `Flatten<Simplify<…>>` — one name
 * longer than doing nothing. Applied **inside this alias body**, the checker
 * resolves it during instantiation and there is no alias left to echo. Budgeted
 * in `test/generated-map.test.ts`.
 *
 * `Declared` is a defaulted type parameter rather than a repeated expression so
 * that {@link DeclaredErrorsFor} is instantiated **once** per call, which is
 * SPEC.md §10.3's Option 1 and the only spelling that keeps the conditional
 * depth off `MatchedRoutes`' scoring path twice over. It is deliberately *not*
 * where `Flatten` goes, per row 3 above.
 */
export type TypedErrorRef<
  ReqT,
  Method,
  Declared = DeclaredErrorsFor<ReqT, Method>,
> = [Declared] extends [never]
  ? NuxtError<unknown>
  : NuxtError<DeclaredErrorBody<Extract<Flatten<Declared>, AnyVariant>>>

// ---------------------------------------------------------------------------
// The declaration (SPEC.md §3.4, §8.3(b))
// ---------------------------------------------------------------------------

/**
 * A full five-overload mirror of vanilla `useFetch`
 * (`nuxt/dist/app/composables/fetch.d.ts:27-33`) with the `ErrorT` slot
 * **deleted** from each and the error computed in the return type instead.
 *
 * ## Why five
 *
 * **A missing overload *is* the compile error SPEC.md §6.1's degradation lock
 * forbids.** A single signature was measured to break two real call shapes —
 * `useTypedFetch<Foo>(url)` and `useTypedFetch(url, 'my-key')`. Overloads 2 and
 * 4 differ from 1 and 3 only in `DefaultT` defaulting to `DataT`, and were
 * measured never to win resolution — but *what selects them* was explicitly
 * never established, so they are mirrored rather than dropped on an unfinished
 * understanding.
 *
 * ## Why the `ErrorT` slot is deleted rather than moved
 *
 * It sits at generic position #2 with `ReqT` at #3, and `TS2744: Type parameter
 * defaults can only reference previously declared type parameters` makes it
 * unable to default from anything computed from `ReqT`. Hoisting `ReqT` to the
 * front compiles, but costs `ResT` position #1 and with it the
 * explicit-response-type call shape. Deleting the slot keeps `ResT` at #1 and
 * loses nothing real: passing #2 explicitly was measured to collapse `ReqT` to
 * `NitroFetchRequest` and `data.value` to `unknown`, so no caller could ever
 * have used it.
 *
 * ## Why an interface rather than five `function` declarations
 *
 * SPEC.md §8.3(b), and it is a mandate rather than a style note: **1075
 * characters** of rendered hover as a bare `function` declaration against
 * **55** as a named interface, because a named interface renders as its own
 * name. Vanilla `useFetch` is 94 for exactly this reason. **The overload count
 * therefore does not reach the hover**, so the five above cost legibility
 * nothing. Budgeted in `test/generated-map.test.ts`.
 *
 * ## What is deliberately *not* here
 *
 * No `useAsyncData` counterpart (SPEC.md §3.4). It takes a **function, not a
 * route literal**, so there is no path for the map to be keyed by and nothing
 * in the call the union could be inferred from. A wrapper could only re-ask for
 * the route *unverifiably* — nothing would make the handler call the path it
 * claims. Both existing routes to typed errors work with no new API:
 *
 * ```ts
 * useAsyncData(() => $typedFetch('/api/users/1'))            // compose (§3.5)
 * useAsyncData<User, DeclaredErrorBody<DeclaredErrorsOf<'/api/users/:id'>>>(…)
 * ```
 *
 * The second works because Nuxt's `NuxtErrorFor<T>` wraps a non-`Error` payload
 * in `NuxtError<T>`, which is exactly the shape `declaredError()` reads.
 */
export interface UseTypedFetch {
  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts: UseFetchOptionsWithTransform<
      _ResT,
      DataT,
      PickKeys,
      DefaultT,
      ReqT,
      Method
    >
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    TypedErrorRef<ReqT, Method> | undefined
  >

  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts: UseFetchOptionsWithTransform<
      _ResT,
      DataT,
      PickKeys,
      DefaultT,
      ReqT,
      Method
    >
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    TypedErrorRef<ReqT, Method> | undefined
  >

  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts?: UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    TypedErrorRef<ReqT, Method> | undefined
  >

  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts?: UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    TypedErrorRef<ReqT, Method> | undefined
  >

  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    arg1?:
      | string
      | UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>,
    arg2?: string
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    TypedErrorRef<ReqT, Method> | undefined
  >
}

// ---------------------------------------------------------------------------
// The header merge (SPEC.md §3.8)
// ---------------------------------------------------------------------------

/**
 * Every request this module makes must carry `accept: application/json`
 * (SPEC.md §3.8).
 *
 * This is not cosmetic. Nitro's `isJsonRequest` decides whether an error comes
 * back as JSON or as a rendered HTML error page, and on SSR the internal
 * `$fetch` carries no `accept` header — so the decision falls through to
 * `event.path.startsWith('/api/')`, which fails for every route outside
 * `/api/**` and for every route under a non-root `app.baseURL` (ofetch prefixes
 * it, so `/shop/api/x` fails the test). Lose the header and a declared 403
 * arrives as an HTML string in `err.data`.
 */
const ACCEPT_JSON = 'application/json'

/**
 * Resolve whatever a caller put in `headers` into something `new Headers(…)`
 * accepts, unwrapping refs on the way.
 *
 * Vanilla's option type is `ComputedOptions<HeadersInit>`, so **every level is
 * legally a ref or a getter**: the whole value, and each value of a plain
 * object or tuple array. Vanilla gets away with never unwrapping the inner
 * level because it hands the object to `reactive()`, whose proxy unwraps a ref
 * on property access — ofetch then reads through that proxy. Anything that
 * reads the raw object first, as a merge must, has to do the unwrapping itself
 * or a `ref('Bearer …')` stringifies to `[object Object]`.
 */
function resolveHeadersInit(raw: unknown): HeadersInit | undefined {
  if (raw === null || raw === undefined) return undefined

  // A `Headers` instance is already exactly what the constructor wants, and
  // rebuilding it entry by entry would only risk losing one.
  if (raw instanceof Headers) return raw

  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      const [name, value] = entry as [unknown, unknown]
      return [String(toValue(name)), String(toValue(value))] as [string, string]
    })
  }

  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([name, value]) => [
      name,
      String(toValue(value)),
    ])
  )
}

/**
 * The call's headers with `accept: application/json` added when the caller did
 * not name one — built through a `Headers`, and handed back **flattened**.
 *
 * ## Why a `Headers` in the middle
 *
 * **Naive spreading is a shipped-defect-class bug**, not a style issue. A
 * caller passing `new Headers({ authorization: … })` — a legal, common form —
 * has no own enumerable properties, so `{ accept, ...opts.headers }` silently
 * drops every header they set; a tuple array spreads to `{"0": […], "1": […]}`
 * and is corrupted outright. `new Headers(init)` is the one merge that accepts
 * all three input shapes, and `has('accept')` is the one check that sees a
 * caller's own `accept` in all three (SPEC.md §3.8).
 *
 * ## Why it is flattened again on the way out, unlike SPEC.md §3.8's global rule
 *
 * SPEC.md §3.8 puts the flattening on the *event-bound* wrapper only, on the
 * grounds that `event.$fetch` is `fetchWithEvent`, which merges headers by
 * **object spread** (`h3@1.15.11 dist/index.mjs:1263-1274`) — and a `Headers`
 * instance spreads to nothing there.
 *
 * **Measured: `useFetch` reaches `fetchWithEvent` too.** Its runtime swaps in
 * `useRequestFetch()` — which *is* `event.$fetch` — for every same-origin
 * request during SSR (`nuxt@4.5.1 dist/app/composables/fetch.js:106-109`), and
 * SSR is the case SPEC.md §3.8 exists for. Handing that path a `Headers`
 * instance would discard the caller's headers *and* this module's own `accept`,
 * i.e. it would introduce the exact bug SPEC.md §3.8 forbids, on the exact path
 * it was written to protect. So this surface builds a `Headers` **and**
 * flattens it, which is neither of the two merges SPEC.md §3.8 writes down.
 * Recorded as SPEC-AMENDMENTS item 30.
 *
 * ## Why a `computed`
 *
 * Reactivity. `headers` is a watched option: vanilla puts the whole options
 * object into a `reactive()` that `useAsyncData` watches, so a
 * `headers: someRef` re-fetches when the ref changes. Resolving eagerly here
 * would freeze the value at call time; a plain getter function would be
 * resolved once per request but tracked by nothing. A `computed` is a ref, so
 * `reactive()` unwraps it on access and the deep watch tracks whatever the
 * computation read — which is vanilla's behaviour, preserved.
 *
 * ## The one rule that has no analogue here
 *
 * SPEC.md §3.8's global rule is *set `accept` only when neither the call nor
 * the instance defaults carry it*, and names `$typedFetch.create`'s closure as
 * what can check the second half. This surface has no such closure: Nuxt's
 * `experimental.defaults.useFetch` is `Pick<FetchOptions, 'timeout' | 'retry' |
 * 'retryDelay' | 'retryStatusCodes'>` and cannot carry headers at all, and an
 * ofetch instance handed in as `opts.$fetch` keeps its defaults in a closure
 * nothing can read. So *the call* is the whole of "already carries it" here,
 * and an `accept` set on a custom `$fetch` instance's defaults loses to this
 * one — which is ofetch's own precedence rule (`mergeHeaders(input, defaults)`
 * sets call headers over instance ones), not a choice made here.
 */
function acceptJsonHeaders(headers: unknown): ComputedRef<HeadersInit> {
  return computed(() => {
    const merged = new Headers(resolveHeadersInit(toValue(headers)))

    if (!merged.has('accept')) merged.set('accept', ACCEPT_JSON)

    return Object.fromEntries(merged)
  })
}

// ---------------------------------------------------------------------------
// The values
// ---------------------------------------------------------------------------

/**
 * Vanilla's runtime signature, which is overload 5's: the middle argument is
 * either the options object or the auto-key, and the third is the auto-key when
 * the middle one was not.
 */
type VanillaUseFetch = (
  request: unknown,
  arg1?: unknown,
  arg2?: unknown
) => unknown

/**
 * The whole wrapper: split vanilla's `(request, arg1, arg2)` the way vanilla
 * splits it, add the header, and hand everything else straight on.
 *
 * `opts` is forwarded by spread rather than rebuilt, which is what makes
 * SPEC.md §3.4's *"every vanilla option carries over verbatim"* true by
 * construction: `transform`, `pick`, `default`, `lazy`, `watch`, `immediate`,
 * `$fetch`, `key` and everything a future Nuxt adds pass through untouched and
 * unenumerated.
 *
 * The auto-key is forwarded in vanilla's own third position, so a caller's
 * `useTypedFetch(url, 'my-key')` keeps meaning what it meant — and because
 * three arguments are always passed on, Nuxt's key-injection transform never
 * appends a fourth to *this* call and collapses every call site onto one key.
 */
function wrapVanillaFetch(vanilla: VanillaUseFetch): UseTypedFetch {
  return ((request: unknown, arg1?: unknown, arg2?: unknown) => {
    const [opts, autoKey] =
      typeof arg1 === 'string'
        ? ([undefined, arg1] as const)
        : ([
            arg1 as Record<string, unknown> | undefined,
            arg2 as string | undefined,
          ] as const)

    return vanilla(
      request,
      { ...opts, headers: acceptJsonHeaders(opts?.headers) },
      autoKey
    )
  }) as UseTypedFetch
}

/**
 * Vanilla's fetch composable, with typings added and nothing else
 * (SPEC.md §3.4).
 *
 * ```ts
 * const { data, error } = await useTypedFetch('/api/users/42')
 * const failure = useDeclaredError(error)
 * const current = failure.value          // ← narrowing lands on a local const
 * if (current) {
 *   switch (current.tag) { … }
 * }
 * ```
 *
 * `data` is what it always was and `error` is honest — it still holds the
 * framework's error object — and the declared union is one named call away
 * instead of three property hops through a frozen wire key.
 */
export const useTypedFetch: UseTypedFetch = wrapVanillaFetch(
  useFetch as unknown as VanillaUseFetch
)

/**
 * The lazy sibling: the same interface, with the lazy option supplied at run
 * time exactly as vanilla does it (SPEC.md §3.4).
 *
 * Delegating to Nuxt's own `useLazyFetch` rather than passing `lazy: true`
 * ourselves is what keeps "exactly as vanilla does" true of the details as
 * well — Nuxt also tags the call for its dev-mode data diagnostics, and that
 * tag would be wrong if the option were supplied from here.
 */
export const useLazyTypedFetch: UseTypedFetch = wrapVanillaFetch(
  useLazyFetch as unknown as VanillaUseFetch
)
