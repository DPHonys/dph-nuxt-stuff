<script setup lang="ts">
import { DECLARED_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'
import { describeUserFailure } from '#shared/lookup-probe'
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
  </main>
</template>
