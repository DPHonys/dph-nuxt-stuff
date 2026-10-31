/**
 * Vanilla `$fetch` and `useFetch` call sites to this app's routes, nothing of
 * this package's imported. Compiled by `test/e2e/native-engine.test.ts` in
 * both route engines' programs:
 *
 * - with Nuxt's generated route engine (`experimental.routeTypedFetch`, Nuxt
 *   4.6 and later), every line marked `refused natively` must be refused, and
 *   nothing else: the `H3Event<Request>` slot types body and query;
 * - on Nitro's route types (the flag off, every Nuxt 4), the file compiles
 *   clean, refused lines included: vanilla `$fetch` types neither, as before.
 *
 * No `@ts-expect-error`: a directive over a call would also swallow a
 * stack-depth error, and the refusals are the point.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

/** Never called: the call sites exist to be compiled. */
export async function callSites(): Promise<void> {
  // A body before its transform, and a tuple-composed query.
  const _created = await $fetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _CreatedHolds = Expect<
    Equal<
      typeof _created,
      { id: string; team: string; page: number; age: number }
    >
  >

  // Either method case, and a query value the tuple's second element declares.
  await $fetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core', page: 2 },
  })

  // The output type is not what a client sends.
  await $fetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: 36 }, // refused natively
    query: { team: 'core' },
  })

  await $fetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36', admin: true }, // refused natively
    query: { team: 'core' },
  })

  await $fetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 7 }, // refused natively
  })

  // A declared body is required natively.
  await $fetch('/api/users', { method: 'POST', query: { team: 'core' } }) // refused natively

  // A tuple-composed body needs every element's keys.
  await $fetch('/api/orders', { method: 'PUT', body: { sku: 'a', qty: 1 } })
  await $fetch('/api/orders', { method: 'PUT', body: { sku: 'a' } }) // refused natively

  // A method-less handler's body, on any method.
  await $fetch('/api/items/7', { method: 'POST', body: { qty: 1 } })
  await $fetch('/api/items/7', { method: 'PATCH', body: { qty: '1' } }) // refused natively

  // An interface-typed query, restated by the slot.
  await $fetch('/api/interface-query', { query: { status: 'open' } })
  await $fetch('/api/interface-query', { query: { status: 'gone' } }) // refused natively

  // A coerce query: typed natively, its coerce value any query value.
  await $fetch('/api/search', { query: { q: 'nuxt', page: 2 } })
  await $fetch('/api/search', { query: { q: 'nuxt', page: '2' } })
  await $fetch('/api/search', { query: { q: 7 } }) // refused natively
  await $fetch('/api/search', { query: { q: 'nuxt', sort: 'asc' } }) // refused natively

  // A record body survives a query that is no record.
  await $fetch('/api/query-array-body', {
    method: 'POST',
    body: { title: 'kept' },
  })
  await $fetch('/api/query-array-body', {
    method: 'POST',
    body: { title: 7 }, // refused natively
  })

  // Where Nuxt's extractor reads nothing, vanilla on both engines: an array or
  // primitive body, two handlers on one route and method, a foreign handler
  // declaring nothing.
  await $fetch('/api/tags', { method: 'POST', body: { not: 'an array' } })
  await $fetch('/api/count', { method: 'POST', body: 'not a number' })
  await $fetch('/api/multi', { method: 'POST', body: { anything: 1 } })
  await $fetch('/api/plain', { query: { anything: 1 } })

  // `useFetch` reads the same slot.
  const _users = useFetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _UsersDataHolds = Expect<
    Equal<
      typeof _users.data.value,
      { id: string; team: string; page: number; age: number } | undefined
    >
  >

  useFetch('/api/users', {
    method: 'POST',
    body: { name: 7, age: '36' }, // refused natively
    query: { team: 'core' },
  })

  useFetch('/api/search', { query: { q: 7 } }) // refused natively
}
