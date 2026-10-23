// PROTOTYPE (ticket 10): the mirror, flag OFF. The same calls that the
// generated engine rejects compile on the InternalApi engine: vanilla `$fetch`
// never types body or query, whatever the handler type says.
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
await $fetch('/api/users', { method: 'POST', query: { team: 't' } })
await $fetch('/api/users', {
  method: 'POST',
  body: { name: 'a', age: 1 },
  query: { team: 't' },
})
await $fetch('/api/users', {
  method: 'POST',
  body: { name: 'a', age: '1', x: 1 },
  query: { team: 't' },
})
await $fetch('/api/users', { params: { search: 'x' } })
await $fetch('/api/orders', { method: 'PUT', body: { sku: 's' } })
await $fetch('/api/interface-query', { query: { status: 'nope' } })
useFetch('/api/users', {
  method: 'POST',
  body: { name: 1, age: '1' },
  query: { team: 't' },
})
