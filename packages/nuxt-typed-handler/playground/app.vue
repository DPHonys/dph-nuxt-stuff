<script setup lang="ts">
import { matchError } from '@dphonys/nuxt-typed-handler/shared'

/**
 * The live smoke: three typed-fetch call sites over the routes in
 * `server/api/`, each reading the map this app's `nuxt prepare` generated.
 * The compiler-only rows live next door in `request-typing.check.ts`.
 */

// --- a `post` with a declared body: both halves of one route ---------------

const created = ref('no failure')
const { error: createError } = await useTypedFetch('/api/users', {
  method: 'post',
  body: { name: 'Ada', email: 'taken@example.com' },
})

matchError(
  createError,
  {
    'user-exists': (e) => (created.value = `user-exists: ${e.email}`),
    'validation-failed': (e) =>
      (created.value = `rejected: ${e.issues.map((i) => i.message).join(', ')}`),
  },
  (err, unrecognized) =>
    (created.value = unrecognized
      ? `unrecognized: ${unrecognized.tag}`
      : `unknown: ${err.status ?? 0}`)
)

// --- a `get` with a tuple query: two schemas, one raw source ---------------

const { data: searched } = await useTypedFetch('/api/search', {
  query: { page: '2', sort: 'name' },
})

const page = computed(() => searched.value?.page ?? 0)

// --- `.try` on a `validate`-only route, matched over the built-in variant --

async function describeSearch(): Promise<string> {
  const { data, error } = await $typedFetch.try('/api/search', {
    query: { page: 'nope' },
  })

  if (error) {
    let described = 'unknown failure'

    matchError(
      error,
      {
        'validation-failed': (e) =>
          (described = e.issues
            .map((issue) => `${issue.source}.${issue.path.join('.')}`)
            .join(', ')),
      },
      (err) => (described = `unknown: ${err.status ?? 0}`)
    )

    return described
  }

  return `page ${data.page}`
}

const described = await describeSearch()
</script>

<template>
  <main>
    <h1>Nuxt Typed Handler</h1>
    <p data-testid="created">{{ created }}</p>
    <p data-testid="page">{{ page }}</p>
    <p data-testid="described">{{ described }}</p>
  </main>
</template>
