// PROTOTYPE (ticket 10): the native engine fixture, flag ON. Vanilla `$fetch`
// and `useFetch` type body and query on better-handler routes through the
// `H3Event<Request>` slot alone - no module types involved.
import type { NuxtError } from 'nuxt/app'

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false
type Expect<T extends true> = T

const created = await $fetch('/api/users', {
  method: 'POST',
  body: { name: 'a', age: '1' },
  query: { team: 't' },
})
type _created = Expect<
  Equal<typeof created, { id: string; team: string; page: number; age: number }>
>
await $fetch('/api/users', {
  method: 'post',
  body: { name: 'a', age: '1' },
  query: { team: 't', page: 2 },
})
// @ts-expect-error - body required (declared, not nullable)
await $fetch('/api/users', { method: 'POST', query: { team: 't' } })
await $fetch('/api/users', {
  method: 'POST',
  // @ts-expect-error - wrong body: the output type is not the wire type
  body: { name: 'a', age: 1 },
  query: { team: 't' },
})
await $fetch('/api/users', {
  method: 'POST',
  // @ts-expect-error - excess body key
  body: { name: 'a', age: '1', x: 1 },
  query: { team: 't' },
})
await $fetch('/api/users', {
  method: 'POST',
  body: { name: 'a', age: '1' },
  // @ts-expect-error - wrong query value type
  query: { team: 1 },
})
// Native query requiredness is not ours: Nuxt never requires `query`.
await $fetch('/api/users', { method: 'POST', body: { name: 'a', age: '1' } })
// Native body requiredness is not ours: an all-optional body is still required.
// @ts-expect-error - Nuxt requires `body` whenever it is declared and not nullable
await $fetch('/api/profile', { method: 'PATCH' })
await $fetch('/api/profile', { method: 'PATCH', body: {} })
// `params` is refused by the generated engine.
// @ts-expect-error - params
await $fetch('/api/users', { params: { search: 'x' } })
// Tuple-composed body, default-method route.
await $fetch('/api/orders', { method: 'PUT', body: { sku: 's', qty: 1 } })
// @ts-expect-error - tuple body: both elements' required keys
await $fetch('/api/orders', { method: 'PUT', body: { sku: 's' } })
await $fetch('/api/items/1', { method: 'POST', body: { qty: 1 } })
// @ts-expect-error - default handler body typed for every method
await $fetch('/api/items/1', { method: 'POST', body: { qty: '1' } })
// Interface-typed query reaches Nuxt through the restated slot.
await $fetch('/api/interface-query', { query: { status: 'open' } })
// @ts-expect-error - interface query value checked natively
await $fetch('/api/interface-query', { query: { status: 'nope' } })

// Vanilla on the native path: array, primitive, coerce-query, multi-handler,
// undeclared - anything ofetch accepts.
await $fetch('/api/tags', { method: 'POST', body: { not: 'an array' } })
await $fetch('/api/count', { method: 'POST', body: 'not a number' })
await $fetch('/api/search', { query: { q: 1, page: 'x', extra: true } })
await $fetch('/api/multi', { method: 'POST', body: { anything: 1 } })
await $fetch('/api/plain', { query: { anything: 1 } })

// useFetch: same request typing; the error slot stays NuxtError<unknown> (spec: left unfilled).
const u = useFetch('/api/users', {
  method: 'POST',
  body: { name: 'a', age: '1' },
  query: { team: 't' },
})
type _uData = Expect<
  Equal<
    typeof u.data.value,
    { id: string; team: string; page: number; age: number } | undefined
  >
>
type _uError = Expect<
  Equal<typeof u.error.value, NuxtError<unknown> | undefined>
>
useFetch('/api/users', {
  method: 'POST',
  // @ts-expect-error - useFetch body checked natively too
  body: { name: 1, age: '1' },
  query: { team: 't' },
})
