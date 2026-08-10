/**
 * `useTypedFetch` at layer 1: the composable against Nuxt's
 * **real** `#app` types, in a program whose `InternalApi` is empty.
 *
 * An empty route interface is not a limitation here, it is the fixture: every
 * route is an undeclared route, so this is where the degradation
 * lock can be stated as *"byte-identical to vanilla"* and meant literally. The
 * declared side needs a generated map and is asserted at layer 3, in
 * `test/e2e/generated-map.test.ts` and `playground/app.vue`.
 *
 * Compiled by `test/types/use-typed-fetch.test.ts` against the **package's own**
 * `tsconfig.json` rather than `tsconfig.fixtures.json`, because `#app` resolves
 * only through the `paths` the module builder generates. That config excludes
 * the two fixtures which augment `InternalApi`, which is what keeps the route
 * interface empty here.
 *
 * Must compile with **zero** diagnostics.
 */

import type { AvailableRouterMethod, NitroFetchRequest } from 'nitropack/types'
import type { Ref } from 'vue'
import { useFetch, useLazyFetch } from '#app'
import type { FetchResult, UseFetchOptions } from '#app'
import type { AsyncData, KeysOf, PickFrom } from '#app/composables/asyncData'
import {
  useLazyTypedFetch,
  useTypedFetch,
} from '../../../src/runtime/app/composables/use-typed-fetch'
import type { TypedErrorRef } from '../../../src/runtime/app/composables/use-typed-fetch'
import type { Equal, Expect } from '../vocabulary'

// ---------------------------------------------------------------------------
// The declaration shape, as a rendering pair
// ---------------------------------------------------------------------------

/**
 * The good half of the hover budget: a named `interface` renders as
 * its own name, so the five overloads cost the hover nothing.
 */
const _useTypedFetch = useTypedFetch

/**
 * The bad half, and the reason the interface shape is a mandate rather than a style note:
 * the **same signature** written as a bare `function` declaration, which is
 * what an implementer reaching for the obvious spelling would produce.
 *
 * Only one of the five overloads is written out. That understates the failure
 * by roughly five times and is deliberate — the measured pair is then a floor
 * on the regression rather than a flattering maximum.
 */
type RouteMethod<R extends NitroFetchRequest> =
  | AvailableRouterMethod<R>
  | Uppercase<AvailableRouterMethod<R>>

declare function bareUseTypedFetch<
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

const _bareUseTypedFetch = bareUseTypedFetch

// ---------------------------------------------------------------------------
// The degradation lock, stated as byte-identity
// ---------------------------------------------------------------------------

const _typedLiteral = useTypedFetch('/api/undeclared')
const _vanillaLiteral = useFetch('/api/undeclared')

/** The hover pair `test/types/use-typed-fetch.test.ts` compares character for character. */
const _typedUndeclaredError = _typedLiteral.error
const _vanillaUndeclaredError = _vanillaLiteral.error

/**
 * **Both channels, not just the error one.** A wrapper that got the error type
 * right and the data type wrong would still have broken the lock.
 */
type _undeclaredErrorIsVanillas = Expect<
  Equal<typeof _typedLiteral.error, typeof _vanillaLiteral.error>
>
type _undeclaredDataIsVanillas = Expect<
  Equal<typeof _typedLiteral.data, typeof _vanillaLiteral.data>
>

/**
 * `NitroFetchRequest` terminates in `(string & {})` and admits a `Request`
 * object, so vanilla accepts an arbitrary runtime-built path and a request
 * object alike. Constraining the route to the map's own keys
 * would reject both, which is exactly what the lock forbids.
 */
declare const builtPath: string
const _typedDynamic = useTypedFetch(builtPath)
const _vanillaDynamic = useFetch(builtPath)

type _dynamicPathIsVanillas = Expect<
  Equal<typeof _typedDynamic.error, typeof _vanillaDynamic.error>
>

declare const requestObject: Request
const _typedRequest = useTypedFetch(requestObject)
const _vanillaRequest = useFetch(requestObject)

type _requestObjectIsVanillas = Expect<
  Equal<typeof _typedRequest.error, typeof _vanillaRequest.error>
>

/**
 * A ref and a getter are both legal request forms, and both stay so.
 */
declare const refRequest: Ref<'/api/undeclared'>
const _typedRefRequest = useTypedFetch(refRequest)
const _typedGetterRequest = useTypedFetch(() => '/api/undeclared' as const)

type _refAndGetterAgree = Expect<
  Equal<typeof _typedRefRequest.error, typeof _typedGetterRequest.error>
>

/**
 * The collapse itself, named rather than reached through a call — the type
 * `test/types/use-typed-fetch.test.ts` renders against its uncollapsed twin.
 *
 * `NuxtError<never>` would be *narrower* than vanilla's `NuxtError<unknown>`,
 * leaving `error.value.data` uninhabited.
 */
type _CollapsedError = TypedErrorRef<'/api/undeclared', 'get'>

type _collapseGivesVanillasEnvelope = Expect<
  Equal<
    _CollapsedError | undefined,
    NonNullable<typeof _typedLiteral.error>['value']
  >
>

// ---------------------------------------------------------------------------
// All five overloads, and every vanilla option
// ---------------------------------------------------------------------------

/**
 * **Every claim below is pairwise against vanilla**, with the identical
 * arguments passed to both. That is what *"adds typings only"*
 * means as an assertion: not that the data type matches some expectation
 * written here, but that it is whatever `useFetch` says it is — including
 * wherever vanilla's own answer is surprising.
 */

/**
 * Overloads 1 and 2 — `opts` **required**, carrying a `transform`. That is the
 * pair `UseFetchOptionsWithTransform` selects, and dropping either would leave
 * a legal call shape as a compile error, which the degradation lock forbids.
 */
const _typedTransform = useTypedFetch('/api/undeclared', {
  transform: (input: unknown) => ({ wrapped: input }),
})
const _vanillaTransform = useFetch('/api/undeclared', {
  transform: (input: unknown) => ({ wrapped: input }),
})

type _transformIsVanillas = Expect<
  Equal<typeof _typedTransform.data, typeof _vanillaTransform.data>
>

/**
 * Overloads 3 and 4 — `opts` optional. **`default` is the sole driver of the
 * data ref's absent member**, and mirroring the overloads
 * verbatim is what preserves that; the two pairs below differ only in whether
 * it was supplied. That the absent member is `undefined` rather than `null`
 * needs a route with a real success type and is asserted in
 * `playground/app.vue`.
 */
const _typedBare = useTypedFetch('/api/undeclared')
const _vanillaBare = useFetch('/api/undeclared')

type _bareCallIsVanillas = Expect<
  Equal<typeof _typedBare.data, typeof _vanillaBare.data>
>

const _typedDefault = useTypedFetch('/api/undeclared', {
  default: () => 'fallback' as const,
})
const _vanillaDefault = useFetch('/api/undeclared', {
  default: () => 'fallback' as const,
})

type _defaultIsVanillas = Expect<
  Equal<typeof _typedDefault.data, typeof _vanillaDefault.data>
>

/**
 * `pick`, `lazy`, `immediate`, `server`, `watch`, `key`, `deep` and `dedupe` —
 * the rest of the vanilla option list, in one call each. None can interact with the
 * error typing, because the error is computed from the request and the method
 * alone and never touches the data type.
 */
declare const watched: Ref<number>

const _typedEverything = useTypedFetch<{ id: string; secret: string }>(
  '/api/undeclared',
  {
    pick: ['id'],
    lazy: true,
    immediate: false,
    server: false,
    watch: [watched],
    key: 'explicit',
    deep: true,
    dedupe: 'defer',
  }
)
const _vanillaEverything = useFetch<{ id: string; secret: string }>(
  '/api/undeclared',
  {
    pick: ['id'],
    lazy: true,
    immediate: false,
    server: false,
    watch: [watched],
    key: 'explicit',
    deep: true,
    dedupe: 'defer',
  }
)

type _everyOptionIsVanillas = Expect<
  Equal<typeof _typedEverything.data, typeof _vanillaEverything.data>
>
type _everyOptionLeavesTheErrorAlone = Expect<
  Equal<typeof _typedEverything.error, typeof _vanillaEverything.error>
>

/**
 * **`ResT` keeps generic position #1.** That is what deleting the `ErrorT` slot
 * rather than reordering it buys: vanilla's #2 was `ErrorT`, and
 * hoisting `ReqT` to the front — which is the other way to make the error type
 * default from the request — would cost `ResT` this position and with it this
 * call shape. Nothing is lost by the deletion, because passing #2 explicitly
 * was measured to collapse `ReqT` and `data.value` to `unknown`.
 */
const _explicitResponse = useTypedFetch<{ id: string }>('/api/undeclared')

type _explicitResponseTypeWins = Expect<
  Equal<typeof _explicitResponse.data.value, { id: string } | undefined>
>

/**
 * Overload 5 — the auto-key form. A single signature was measured to break this
 * call shape and `useTypedFetch<Foo>(url)` above, which is why five are
 * mirrored rather than one written.
 */
const _typedKeyed = useTypedFetch('/api/undeclared', 'my-key')
const _vanillaKeyed = useFetch('/api/undeclared', 'my-key')

type _keyedCallIsVanillas = Expect<
  Equal<typeof _typedKeyed.error, typeof _vanillaKeyed.error>
>

/**
 * The lazy sibling is the same interface, supplied the lazy option at run time
 * exactly as vanilla does — so it is the *same type*, not a parallel one.
 */
const _typedLazy = useLazyTypedFetch('/api/undeclared')
const _vanillaLazy = useLazyFetch('/api/undeclared')

type _lazySiblingIsTheSameInterface = Expect<
  Equal<typeof useLazyTypedFetch, typeof useTypedFetch>
>
type _lazyIsVanillas = Expect<
  Equal<typeof _typedLazy.error, typeof _vanillaLazy.error>
>

/**
 * Everything above is either an `Expect<…>` alias or a `const` a hover
 * assertion reads, so the file's own clean compilation is the assertion. These
 * two exports keep the hover targets from being dead code.
 */
export { _bareUseTypedFetch, _useTypedFetch }
