<script setup lang="ts">
import { DECLARED_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import type {
  DeclaredErrorBody,
  DeclaredErrorsOf,
  TypedApiErrors,
} from '@dphonys/nuxt-handler-errors/types'
import type { NuxtError } from '#app'
import { describeUserFailure } from '#shared/lookup-probe'
import { describeReadFailure } from '#shared/reader-probe'
import { SHARED_CONTEXT_PROBE } from '#shared/specifier-probe'
// The same reach into the module package's own suite the route files make:
// `Equal` and `Expect` are fixed vocabulary and a second copy
// here could drift from the one every other assertion uses.
import type { Equal, Expect } from '../test/types/vocabulary'

/** Context 1 of 3: the Vue client. `<script setup>` cannot export, so the
 * augmentation target is proven reachable through a local alias. */
type _ClientContextErrorMap = TypedApiErrors

// ---------------------------------------------------------------------------
// Layer 3, in `<script setup>` — which is *the* reason the module
// chose a type template over a hand-rolled write: `addTypeTemplate` puts
// the generated file into the app program and into
// `vite.vue.script.globalTypeFiles`, and the composable's primary call site is
// a single-file component. Nothing hermetic can make this claim; it holds only
// if the generated `.nuxt/types/nuxt-handler-errors.d.ts` is really there and
// really binds.
// ---------------------------------------------------------------------------

/** The generated map's entry for a real route, at its real key. */
type UserFailure = TypedApiErrors['/api/users/:id']['get']

/**
 * **The narrowing is the assertion**, and a structural one would not do.
 *
 * Written outside Nitro's `types/` directory the emitted map still parses, but
 * every `import('…')` in it resolves to nothing — silently, because
 * `skipLibCheck` covers a `.d.ts` — and `UserFailure` becomes TypeScript's
 * *error type*. That type satisfies every `Expect<Equal<…>>` written against
 * it (measured). What it does not do is make a `switch`
 * exhaustive, so the absent final `return` below becomes a real `TS2366`. This
 * function is red exactly when the map has stopped meaning anything.
 */
function describeFailure(failure: UserFailure): string {
  switch (failure.tag) {
    case 'user-not-found':
      return `user-not-found: ${failure.userId}`
    case 'user-suspended':
      return `user-suspended until ${failure.until}`
    case 'forbidden':
      return `forbidden, needs ${failure.requiredRole}`
  }
}

const narrowed = describeFailure({
  tag: 'forbidden',
  status: 403,
  requiredRole: 'owner',
})

/**
 * The same claim reached through the **lookup** rather than through a raw index
 * — the route named by its path alone, from a helper living in the consumer's
 * `shared/` directory. Its `switch` is exhaustive for the
 * same reason `describeFailure`'s is, and red for the same reason.
 */
const looked = describeUserFailure({
  tag: 'user-not-found',
  status: 404,
  userId: '42',
})

// ---------------------------------------------------------------------------
// The readers, in the context they were designed for.
//
// **Neither name is imported.** Both arrive through the module's `addImports`
// registration, which is the sugar half of the design — the hand-writable
// `/shared` specifier stays the contract, and `#shared/reader-probe.ts` above
// exercises that half. Delete the registration and this file stops compiling.
// ---------------------------------------------------------------------------

/**
 * The degraded overload against Nuxt's **real** error type. A vanilla
 * `useFetch` on a declared route still gives `NuxtError<unknown>` — the typed
 * error channel is ticket 10's job — so this reads back the shape
 * floor at compile time while finding the real variant at run time. That
 * combination is the whole claim about what the wire guarantees.
 */
const { error: vanillaError } = await useFetch('/api/users/missing')
const floor = useDeclaredError(vanillaError)
const read = floor.value ? `${floor.value.tag}/${floor.value.status}` : 'none'

/**
 * The declared overload, again against the real `NuxtError`, with the union
 * named from the route path alone. Ticket 10's `useTypedFetch` produces exactly
 * this ref.
 */
const typedError =
  ref<NuxtError<DeclaredErrorBody<DeclaredErrorsOf<'/api/users/:id'>>>>()

/**
 * **Narrowing lands on a local const**, and the
 * two lines below are the assertion rather than a demonstration of it:
 *
 * - `describeUserFailure` takes `DeclaredErrorsOf<'/api/users/:id'>`, so it
 *   only accepts `current` if the reader really inferred the declared union out
 *   of a real `Ref<NuxtError<…>>`. Had the first overload not matched, this
 *   would be the shape floor, and `AnyVariant` is not assignable to that
 *   parameter. Measured: making the overload return `AnyVariant` reddens the
 *   whole `switch` in `#shared/reader-probe`.
 * - `current.requiredRole` is reachable only because the narrowing survived the
 *   `.value` read, which is the thing a `NuxtError`-shaped read cannot do.
 */
const typedFailure = useDeclaredError(typedError)
const current = typedFailure.value
const typedRead = current === undefined ? 'none' : describeUserFailure(current)
const owner = current?.tag === 'forbidden' ? current.requiredRole : 'none'

/**
 * The same reader reached from the consumer's own `shared/` directory, over the
 * real failure the vanilla fetch above produced — so the `/shared` path is run
 * rather than merely compiled. The cast is honest and is exactly what ticket 10
 * removes: `useFetch` types this ref as `NuxtError<unknown>`, and until the
 * typed wrapper exists nothing on the client can hand a `shared/` helper the
 * declared shape without saying so.
 */
const fromShared = describeReadFailure(
  vanillaError.value as Parameters<typeof describeReadFailure>[0]
)

// ---------------------------------------------------------------------------
// The composable, in `<script setup>` — its primary call site,
// and the one context nothing hermetic can stand in for.
//
// **Neither `useTypedFetch` nor `useLazyTypedFetch` is imported.** Both arrive
// through the module's `addImports` registration, which for these two names is
// the *whole* contract rather than sugar on top of a hand-writable specifier:
// the composable calls `useFetch`, which lives behind `#app`, and none of
// the three published specifiers may carry that import.
// ---------------------------------------------------------------------------

/**
 * **The narrowing is the assertion, and it runs through four generic levels.**
 *
 * `error` is declared as `NuxtError<DeclaredErrorBody<DeclaredErrorsOf<…>>>`,
 * where the innermost type is named from the route path alone. Handing
 * `current` to `describeUserFailure` — whose parameter is
 * `DeclaredErrorsOf<'/api/users/:id'>` and whose `switch` is exhaustive — is
 * what claims that the whole chain survived: the composable's return type, the
 * reader's first overload, and the `.value` read onto a local `const`.
 *
 * This is also the line that would go red if the composable's error type
 * degraded to vanilla's `NuxtError<unknown>`: the reader would fall to its
 * second overload and `AnyVariant` is not assignable to that parameter.
 */
const { data: _user, error: userError } =
  await useTypedFetch('/api/users/private')
const userFailure = useDeclaredError(userError)
const currentUserFailure = userFailure.value
const typedFetchRead =
  currentUserFailure === undefined
    ? 'none'
    : describeUserFailure(currentUserFailure)

/**
 * **`data` is what it always was**. Nitro's own success type,
 * untouched — the declared union rides a sibling property on the handler type
 * and never enters `ReturnType`, so nothing about the error channel reaches
 * this one. Its absent member is `undefined` and **not** `null`, which is what
 * mirroring vanilla's overloads verbatim preserves, and which no route in
 * `test/types/pos/use-typed-fetch.ts`'s empty-`InternalApi` program can show.
 */
type _dataStaysVanilla = Expect<
  Equal<
    typeof _user.value,
    { id: string; name: string; email: string } | undefined
  >
>

/**
 * **The error ref really carries the envelope**, with the union named from the
 * route path alone and nothing else in the way.
 *
 * This lives here rather than in `test/generated-map.test.ts`'s probe on
 * purpose: measured, it goes **red** against that file's broken-specifier
 * fork, which would quietly convert its central demonstration — that structural
 * assertions are blind to a map that has stopped meaning anything — into a file
 * that no longer demonstrates it. The rendering assertions stay there; this
 * one belongs where the app really compiles.
 */
type _errorIsTheEnvelope = Expect<
  Equal<
    typeof userError.value,
    | NuxtError<DeclaredErrorBody<DeclaredErrorsOf<'/api/users/private'>>>
    | undefined
  >
>

/**
 * The method table, reached through the composable's own `Method`
 * type parameter rather than through the lookup — the only thing that proves
 * the method reaches the lookup at all.
 *
 * Row 2: `post` is present on `/api/method-fallback` and unbranded, so the
 * error collapses back to vanilla's envelope — the degradation lock,
 * in the app program, against a route this app really serves. Row 1 — `get`
 * absent, so the `default` handler's union — is rendered in
 * `test/generated-map.test.ts`, which is where a union that had stopped meaning
 * anything would show.
 *
 * `immediate: false` on both: the claim is the type, and neither call needs to
 * cost a request on every render. The undeclared route's *whole* channel is
 * asserted byte-identical to vanilla in `test/generated-map.test.ts` and again
 * hermetically in `test/types/pos/use-typed-fetch.ts`, so it is not restated
 * here.
 */
const _typedPost = useTypedFetch('/api/method-fallback', {
  method: 'POST',
  immediate: false,
})
const _vanillaUndeclared = useFetch('/api/boom', { immediate: false })

type _presentMethodKeyCollapses = Expect<
  Equal<typeof _typedPost.error, typeof _vanillaUndeclared.error>
>

/**
 * **The header merge, run rather than reasoned about.**
 *
 * `/status` echoes back the `accept` and `x-probe` headers it was called with,
 * so what this renders is the merge's actual output on the SSR path — the path
 * the merge exists for.
 *
 * The caller's header is passed as a **`Headers` instance** on purpose. It is a
 * legal, common form and it is the one that breaks silently: it has no own
 * enumerable properties, so a naive `{ accept, ...opts.headers }` drops it
 * whole, and h3's `fetchWithEvent` — which `useFetch` swaps in for same-origin
 * SSR requests — drops it whole too, because it merges headers by object
 * spread. Both failures render `none` here.
 *
 * Asserted in `test/specifiers.test.ts` against a real built server, which is
 * the only place either half is observable.
 */
const { error: statusError } = await useTypedFetch('/status', {
  headers: new Headers({ 'x-probe': 'kept' }),
})
const statusFailure = useDeclaredError(statusError)
const currentStatusFailure = statusFailure.value
const statusRead =
  currentStatusFailure === undefined
    ? 'none'
    : `${currentStatusFailure.tag}/${currentStatusFailure.accept}/${currentStatusFailure.probe}`

/**
 * The lazy sibling — the same interface, so the same union comes back out
 *. `immediate: false` keeps it from adding a third request to
 * every page render; the claim here is the type, and the runtime half is
 * covered by the two calls above.
 */
const { error: _lazyError } = useLazyTypedFetch('/api/users/private', {
  immediate: false,
})

type _lazySiblingCarriesTheSameUnion = Expect<
  Equal<typeof _lazyError, typeof userError>
>

// ---------------------------------------------------------------------------
// `$typedFetch`, in `<script setup>` — **with no import**, and
// not through an auto-import either.
//
// It is a genuine global, declared the way Nitro declares its own `$fetch`:
// the type arrives with the emitted map, which imports `/types` and its
// `declare global` block, and the value arrives from the app plugin the module
// registers. Delete either and this block stops compiling or stops running,
// and the two failures look different.
// ---------------------------------------------------------------------------

/**
 * **The hand-off is the assertion**, exactly as it is for the reader: `.safe`'s
 * false arm is handed to `describeUserFailure`, whose parameter is
 * `DeclaredErrorsOf<'/api/users/:id'>` and whose `switch` is exhaustive. The
 * shape floor is not assignable to that parameter, so a union that had degraded
 * is a compile error rather than a silent pass — and `error` is the **flat
 * variant**, because the wrapper already ran the reader internally.
 */
const globalSafe = await $typedFetch.safe('/api/users/private')
const globalRead = globalSafe.ok
  ? 'no failure'
  : `global:${describeUserFailure(globalSafe.error)}`

/**
 * The degradation lock on this surface: an undeclared route's result
 * has **one arm**, so `ok` is the literal `true` and `data` is reachable with
 * no branch. Without {@link TypedResult}'s collapse `ok` would be `boolean` and
 * the line below would be a compile error — which is the whole reason
 * `TypedResult`'s collapse exists here, and it is a different reason from the
 * composable's.
 *
 * `immediate` has no meaning on this surface, so the call is real; `/api/boom`
 * throws, which is what the `.catch` is for and what the server-side probe
 * asserts about.
 */
const undeclared = $typedFetch.safe('/api/boom')

type _undeclaredResultHasOneArm = Expect<
  Equal<Awaited<typeof undeclared>['ok'], true>
>

const undeclaredRead = await undeclared.then(
  (result) => `unexpected:${JSON.stringify(result.data)}`,
  () => 'threw'
)

const client = `client:${DECLARED_ERROR_KEY}`
const { data: server } = await useFetch('/api/specifier-probe')
</script>

<template>
  <main>
    <h1>Nuxt Handler Errors</h1>
    <p id="client-context">{{ client }}</p>
    <p id="shared-context">{{ SHARED_CONTEXT_PROBE }}</p>
    <p id="server-context">{{ server?.server }}</p>
    <p id="narrowed-failure">{{ narrowed }}</p>
    <p id="looked-up-failure">{{ looked }}</p>
    <p id="read-failure">{{ read }}</p>
    <p id="typed-read">{{ typedRead }}/{{ owner }}/{{ fromShared }}</p>
    <p id="typed-fetch-read">{{ typedFetchRead }}</p>
    <p id="outside-api-read">{{ statusRead }}</p>
    <p id="global-typed-fetch">{{ globalRead }}/{{ undeclaredRead }}</p>
  </main>
</template>
