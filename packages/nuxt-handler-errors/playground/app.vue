<script setup lang="ts">
import { matchError } from '@dphonys/nuxt-handler-errors/shared'

// --- the composable, with the matcher absorbing the `if (error)` ------------

const fetched = ref('no failure')
const { error: fetchError } = await useCheckedFetch('/api/users/suspended')

matchError(
  fetchError,
  {
    'user-not-found': (e) => (fetched.value = `user-not-found: ${e.userId}`),
    'user-suspended': (e) =>
      (fetched.value = `user-suspended until ${e.until}`),
    forbidden: (e) => (fetched.value = `forbidden, needs ${e.requiredRole}`),
    'rate-limited': (e) =>
      (fetched.value = `rate-limited for ${e.retryAfter}s`),
  },
  (err, unrecognized) =>
    (fetched.value = unrecognized
      ? `unrecognized: ${unrecognized.tag}`
      : `unknown: ${err.status ?? 0}`)
)

// --- asyncData over a repository: the union rides the return type ----------

const userRepo = {
  get: (id: string) => $checkedFetch.try(`/api/users/${id}`),
}

const repo = ref('no failure')
const { error: repoError } = await useCheckedAsyncData('user', () =>
  userRepo.get('private')
)

matchError(
  repoError,
  {
    'user-not-found': (e) => (repo.value = `user-not-found: ${e.userId}`),
    'user-suspended': (e) => (repo.value = `user-suspended until ${e.until}`),
    forbidden: (e) => (repo.value = `forbidden, needs ${e.requiredRole}`),
    'rate-limited': (e) => (repo.value = `rate-limited for ${e.retryAfter}s`),
  },
  (err) => (repo.value = `unknown: ${err.status ?? 0}`)
)

// --- imperative: a function can return, so `.try` is the shape that fits ---

async function describeChain(): Promise<string> {
  const { data, error } = await $checkedFetch.try('/api/chain/c', {
    query: { mode: 'gone' },
  })

  if (error) {
    let described = 'unknown failure'

    matchError(
      error,
      { 'c-gone': (e) => (described = `c-gone: ${e.resource}`) },
      (err, unrecognized) =>
        (described = unrecognized
          ? `unrecognized: ${unrecognized.tag}`
          : `unknown: ${err.status ?? 0}`)
    )

    return described
  }

  return `chain ok, cookie ${data.cookie}`
}

const imperative = await describeChain()

// --- degraded: no arms at all, the tag read off the fallback ---------------

/** A throwing `useAsyncData` handler stays vanilla, and degrades honestly. */
const thrown = ref('no failure')
const { error: thrownError } = await useAsyncData('thrown-user', () =>
  $checkedFetch('/api/users/missing')
)

matchError(
  thrownError,
  {},
  (err, unrecognized) =>
    (thrown.value = unrecognized
      ? `${unrecognized.tag}/${unrecognized.status}`
      : `unknown: ${err.status ?? 0}`)
)

/**
 * Vanilla `useFetch` - no surface of this package, so nothing attaches the
 * channel tag and the response comes back stripped. With gating configured,
 * this is what a call outside the checked family sees.
 */
const degraded = ref('no failure')
const { error: degradedError } = await useFetch('/api/users/missing')

matchError(
  degradedError,
  {},
  (err, unrecognized) =>
    (degraded.value = unrecognized
      ? `${unrecognized.tag}/${unrecognized.status}`
      : `unknown: ${err.status ?? 0}`)
)
</script>

<template>
  <main>
    <h1>Nuxt Handler Errors</h1>
    <p data-testid="fetched">{{ fetched }}</p>
    <p data-testid="repo">{{ repo }}</p>
    <p data-testid="imperative">{{ imperative }}</p>
    <p data-testid="thrown">{{ thrown }}</p>
    <p data-testid="degraded">{{ degraded }}</p>
  </main>
</template>
