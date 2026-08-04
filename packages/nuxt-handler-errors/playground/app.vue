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

/** Context 1 of 3: the Vue client. `<script setup>` cannot export, so the
 * augmentation target is proven reachable through a local alias. */
type _ClientContextErrorMap = TypedApiErrors

// ---------------------------------------------------------------------------
// Layer 3 (SPEC.md §9.1), in `<script setup>` — which is *the* reason SPEC.md
// §4.2 chose a type template over a hand-rolled write: `addTypeTemplate` puts
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
 * it (measured: SPEC-AMENDMENTS item 9). What it does not do is make a `switch`
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
 * `shared/` directory (SPEC.md §3.6, §4.3). Its `switch` is exhaustive for the
 * same reason `describeFailure`'s is, and red for the same reason.
 */
const looked = describeUserFailure({
  tag: 'user-not-found',
  status: 404,
  userId: '42',
})

// ---------------------------------------------------------------------------
// The readers (SPEC.md §3.7), in the context they were designed for.
//
// **Neither name is imported.** Both arrive through the module's `addImports`
// registration, which is the sugar half of SPEC.md §3.7 — the hand-writable
// `/shared` specifier stays the contract, and `#shared/reader-probe.ts` above
// exercises that half. Delete the registration and this file stops compiling.
// ---------------------------------------------------------------------------

/**
 * The degraded overload against Nuxt's **real** error type. A vanilla
 * `useFetch` on a declared route still gives `NuxtError<unknown>` — the typed
 * error channel is ticket 10's job — so this reads back SPEC.md §5.3's shape
 * floor at compile time while finding the real variant at run time. That
 * combination is SPEC.md §5.3's whole claim about what the wire guarantees.
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
 * **Narrowing lands on a local const** (SPEC.md §3.7 consequence 1), and the
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
  </main>
</template>
