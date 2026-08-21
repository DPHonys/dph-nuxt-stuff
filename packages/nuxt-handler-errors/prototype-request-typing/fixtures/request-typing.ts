// PROTOTYPE fixtures. A line that compiles where it must not is itself an error (TS2578, unused
// expect-error directive), so `tsc` clean means every row of the contract held.
import type { NitroFetchOptions } from 'nitropack/types'
import { ref } from 'vue'
import type { $TypedFetch, TypedRequestOptions } from '../lib/typed-fetch'
import { useTypedFetch } from '../lib/typed-fetch'
import type { ValidationFailed } from '../lib/typed-handler'

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
type Expect<T extends true> = T

declare const $typedFetch: $TypedFetch

export async function main() {
  // --- 1. required body when declared, INPUT (pre-transform) types, excess key rejected ----
  const created = await $typedFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    query: { team: 't', page: 2 },
  })
  type _resp = Expect<Equal<typeof created, { id: string; team: string; page: number; ageIsNumber: number }>>

  // @ts-expect-error - body is required on the declared route
  await $typedFetch('/api/users', { method: 'post', query: { team: 't' } })
  // @ts-expect-error - query (tuple; `team` required) is required
  await $typedFetch('/api/users', { method: 'post', body: { name: 'a', age: '30' } })
  // @ts-expect-error - output type (age: number) is NOT what the wire takes
  await $typedFetch('/api/users', { method: 'post', body: { name: 'a', age: 30 }, query: { team: 't' } })
  // @ts-expect-error - excess key on body
  await $typedFetch('/api/users', { method: 'post', body: { name: 'a', age: '30', extra: 1 }, query: { team: 't' } })
  // @ts-expect-error - excess key on query
  await $typedFetch('/api/users', { method: 'post', body: { name: 'a', age: '30' }, query: { team: 't', nope: 1 } })
  // @ts-expect-error - tuple query intersects: `team` from element 1 required even when `page` given
  await $typedFetch('/api/users', { method: 'post', body: { name: 'a', age: '30' }, query: { page: 1 } })

  // --- 2. get default + method-keyed selection; uppercase accepted -------------------------
  const listed = await $typedFetch('/api/users')
  type _get = Expect<Equal<typeof listed, { users: string[] }>>
  const listed2 = await $typedFetch('/api/users', { query: { search: 'x' } })
  type _get2 = Expect<Equal<typeof listed2, { users: string[] }>>
  const upper = await $typedFetch('/api/users', { method: 'POST', body: { name: 'a', age: '1' }, query: { team: 't' } })
  type _upper = Expect<Equal<typeof upper, typeof created>>
  // @ts-expect-error - excess query key on the get route (all-optional schema still checks keys)
  await $typedFetch('/api/users', { query: { search: 'x', zzz: 1 } })
  // @ts-expect-error - body is omitted entirely on get (not even vanilla)
  await $typedFetch('/api/users', { body: { anything: 1 } })

  // --- 3. all-optional query schema is optional --------------------------------------------
  await $typedFetch('/api/users', { method: 'get' })
  await $typedFetch('/api/users', { method: 'GET', query: {} })

  // --- 4. FormData / string body rejected on a declared route --------------------------------
  // @ts-expect-error - string body
  await $typedFetch('/api/users', { method: 'post', body: '{"name":"a"}', query: { team: 't' } })
  // @ts-expect-error - FormData body
  await $typedFetch('/api/users', { method: 'post', body: new FormData(), query: { team: 't' } })

  // --- 5. `default` handler declaring body: get compiles with no body; post requires it -----
  const got = await $typedFetch('/api/items/42')
  type _default = Expect<Equal<typeof got, { item: string; qty: number }>>
  await $typedFetch('/api/items/42', { method: 'post', body: { qty: 1 } })
  // @ts-expect-error - post on the default handler requires the declared body
  await $typedFetch('/api/items/42', { method: 'post' })
  // @ts-expect-error - excess key
  await $typedFetch('/api/items/42', { method: 'put', body: { qty: 1, x: 1 } })
  // template-literal route
  const id = '42' as string
  await $typedFetch(`/api/items/${id}`, { method: 'post', body: { qty: 1 } })

  // --- 6. params omitted family-wide; headers vanilla --------------------------------------
  // @ts-expect-error - ofetch's deprecated alias is not a back door
  await $typedFetch('/api/users', { params: { search: 'x' } })
  // @ts-expect-error - nor on an unbranded route
  await $typedFetch('/api/plain', { params: { a: 1 } })
  await $typedFetch('/api/users', { headers: { 'x-any': 'thing' }, query: { search: 'x' } })

  // --- 7. vanilla degradation: plain handler, errors-only, routerParams-only, external ------
  await $typedFetch('/api/plain', { query: { anything: 1, goes: true } })
  await $typedFetch('/api/errors-only', { method: 'post', body: 'raw string', query: { a: 1 } })
  await $typedFetch('/api/params-only/x', { method: 'post', body: new FormData(), query: { a: 1 } })
  await $typedFetch('https://example.com/x', { method: 'post', body: { a: 1 }, query: { b: 2 } })
  // @ts-expect-error - body is omitted on get even for an unbranded route (family-wide rule)
  await $typedFetch('/api/plain', { method: 'get', body: 'x' })

  // key-for-key: unbranded route options === NitroFetchOptions<R> minus params
  type VanillaGet = TypedRequestOptions<'/api/plain', 'get'>
  type _keys = Expect<Equal<keyof VanillaGet, Exclude<keyof NitroFetchOptions<'/api/plain'>, 'params' | 'body'>>>
  type VanillaPost = TypedRequestOptions<'/api/errors-only', 'post'>
  type _postKeys = Expect<Equal<keyof VanillaPost, Exclude<keyof NitroFetchOptions<'/api/errors-only'>, 'params'>>>
  type _bodyVanilla = Expect<Equal<VanillaPost['body'], NitroFetchOptions<'/api/errors-only'>['body']>>
  type _queryVanilla = Expect<Equal<VanillaPost['query'], NitroFetchOptions<'/api/errors-only'>['query']>>

  // `Request` object as R degrades to no declared inputs
  await $typedFetch(new Request('https://x'), { method: 'post', body: { a: 1 } })

  // --- 8. .try: error union includes validation-failed; validate-only route is typed --------
  const { data, error } = await $typedFetch.try('/api/users', { method: 'post', body: { name: 'a', age: '1' }, query: { team: 't' } })
  if (error) {
    const v = error.data!.data.__knownError__
    type _union = Expect<Equal<typeof v, { tag: 'forbidden'; status: 403 } | ValidationFailed>>
    if (v.tag === 'validation-failed') {
      type _issues = Expect<Equal<typeof v.issues, ValidationFailed['issues']>>
    }
    return
  }
  type _data = Expect<Equal<typeof data, typeof created>>

  const r2 = await $typedFetch.try('/api/users')
  if (r2.error) {
    type _validateOnly = Expect<Equal<NonNullable<typeof r2.error.data>['data']['__knownError__'], ValidationFailed>>
  }
  const r3 = await $typedFetch.try('/api/plain')
  if (r3.error) {
    type _untyped = Expect<Equal<typeof r3.error.data, unknown>>
  }

  // --- 9. union-typed method variable distributes (documented) -------------------------------
  const m = Math.random() > 0.5 ? ('post' as const) : ('get' as const)
  await $typedFetch('/api/users', { method: m, body: { name: 'a', age: '1' }, query: { team: 't', search: 's' } })

  // --- 10. multi-handler (route, method) → union of inputs ---------------------------------
  await $typedFetch('/api/multi', { method: 'post', body: { qty: 1 } })
  await $typedFetch('/api/multi', { method: 'post', body: { name: 'a', age: '1' }, query: { team: 't' } })
  // @ts-expect-error - neither handler's shape
  await $typedFetch('/api/multi', { method: 'post', body: { nope: 1 } })

  // --- 11. create(defaults): default query never relaxes per-call requiredness -----------------
  const api = $typedFetch.create({ query: { team: 'default' } })
  // @ts-expect-error - query still required per call
  await api('/api/users', { method: 'post', body: { name: 'a', age: '1' } })
  await api('/api/users', { method: 'post', body: { name: 'a', age: '1' }, query: { team: 't' } })
  const viaCreate = await api.try('/api/users', { method: 'post', body: { name: 'a', age: '1' }, query: { team: 't' } })
  if (viaCreate.error) {
    type _createTry = Expect<Equal<NonNullable<typeof viaCreate.error.data>['data']['__knownError__'], { tag: 'forbidden'; status: 403 } | ValidationFailed>>
  }

  // --- 12. raw shares the signature --------------------------------------------------------
  // @ts-expect-error - raw is typed the same way
  await $typedFetch.raw('/api/users', { method: 'post', body: {}, query: { team: 't' } })

  // --- 13. explicit T override still works -----------------------------------------------------
  const custom = await $typedFetch<{ custom: true }>('/api/plain')
  type _custom = Expect<Equal<typeof custom, { custom: true }>>

  // --- 14. useTypedFetch: ref / getter / plain, typed and required ---------------------------
  const body = ref({ name: 'a', age: '1' })
  const a = useTypedFetch('/api/users', { method: 'post', body, query: () => ({ team: 't' }) })
  type _useData = Expect<Equal<typeof a.data.value, typeof created | undefined>>
  if (a.error.value) {
    type _useErr = Expect<Equal<NonNullable<typeof a.error.value.data>['data']['__knownError__'], { tag: 'forbidden'; status: 403 } | ValidationFailed>>
  }
  useTypedFetch('/api/users', { method: 'post', body: { name: 'a', age: '1' }, query: { team: 't', page: ref(1) } })
  // @ts-expect-error - required body on useTypedFetch too
  useTypedFetch('/api/users', { method: 'post', query: { team: 't' } })
  // @ts-expect-error - excess key on a plain literal body is still rejected on useTypedFetch
  useTypedFetch('/api/users', { method: 'post', body: { name: 'a', age: '1', extra: 1 }, query: { team: 't' } })
  // FINDING (not a contract row): through a getter or ref() the excess check does NOT fire —
  // `Reactive<T>` is a union target and `ref()` infers its own type. Standard TS; document it.
  useTypedFetch('/api/users', { method: 'post', body: () => ({ name: 'a', age: '1', extra: 1 }), query: { team: 't' } })
  useTypedFetch('/api/users', { method: 'post', body: ref({ name: 'a', age: '1', extra: 1 }), query: { team: 't' } })
  // but a WRONG value type through a getter is still caught
  // @ts-expect-error - age must be a string on the wire
  useTypedFetch('/api/users', { method: 'post', body: () => ({ name: 'a', age: 1 }), query: { team: 't' } })
  const b = useTypedFetch('/api/users')
  type _useGet = Expect<Equal<typeof b.data.value, { users: string[] } | undefined>>
  // @ts-expect-error - params gone here too
  useTypedFetch('/api/users', { params: { a: 1 } })
  useTypedFetch('/api/plain', { query: { anything: ref(1) } })
}
