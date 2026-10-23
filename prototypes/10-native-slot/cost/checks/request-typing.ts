// PROTOTYPE (ticket 10), question 4: the September call-site program
// (prototype/10-request-typing @ b3f8348, fixtures/request-typing.ts) ported
// to the new design: `$betterFetch`, the tag-keyed error map, the exhaustive
// `.try`, `useBetterFetch`. Same rows, same 51-route map at GEN_ROUTES=45.
import { ref } from 'vue'
import { useBetterFetch } from '../../lib/composables'
import type { VanillaFetchOptions } from '../../lib/engine'
import type { ValidationFailed } from '../../lib/handler'
import type {
  BetterRequestOptions,
  KnownErrorFor,
  RequestFailed,
} from '../../lib/request-typing'

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false
type Expect<T extends true> = T
type Forbidden = { _tag: 'forbidden' }
type UsersPostErrors =
  | Forbidden
  | { _tag: 'validation-failed'; issues: ValidationFailed['issues'] }

export async function main() {
  // --- 1. required body when declared, input types, excess keys --------------
  const created = await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    query: { team: 't', page: 2 },
  })
  type _resp = Expect<
    Equal<
      typeof created,
      { id: string; team: string; page: number; ageIsNumber: number }
    >
  >
  // @ts-expect-error - body is required on the declared route
  await $betterFetch('/api/users', { method: 'post', query: { team: 't' } })
  // @ts-expect-error - query (tuple; `team` required) is required
  await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
  })
  await $betterFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - output type (age: number) is NOT what the wire takes
    body: { name: 'a', age: 30 },
    query: { team: 't' },
  })
  await $betterFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - excess key on body
    body: { name: 'a', age: '30', extra: 1 },
    query: { team: 't' },
  })
  await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    // @ts-expect-error - excess key on query
    query: { team: 't', nope: 1 },
  })
  await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    // @ts-expect-error - tuple query intersects
    query: { page: 1 },
  })

  // --- 2. get default, method-keyed selection, uppercase ------------------------
  const listed = await $betterFetch('/api/users')
  type _get = Expect<Equal<typeof listed, { users: string[] }>>
  const upper = await $betterFetch('/api/users', {
    method: 'POST',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })
  type _upper = Expect<Equal<typeof upper, typeof created>>
  // @ts-expect-error - excess query key on the get route
  await $betterFetch('/api/users', { query: { search: 'x', zzz: 1 } })
  // @ts-expect-error - body omitted on get for a branded route
  await $betterFetch('/api/users', { body: { anything: 1 } })

  // --- 3. all-optional query ------------------------------------------------------
  await $betterFetch('/api/users', { method: 'get' })
  await $betterFetch('/api/users', { method: 'GET', query: {} })

  // --- 4. FormData / string body rejected on a declared route -------------------------
  await $betterFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - string body
    body: '{"name":"a"}',
    query: { team: 't' },
  })
  await $betterFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - FormData body
    body: new FormData(),
    query: { team: 't' },
  })

  // --- 5. default handler declaring body ------------------------------------------------
  const got = await $betterFetch('/api/items/42')
  type _default = Expect<Equal<typeof got, { item: string; qty: number }>>
  await $betterFetch('/api/items/42', { method: 'post', body: { qty: 1 } })
  // @ts-expect-error - post on the default handler requires the declared body
  await $betterFetch('/api/items/42', { method: 'post' })
  // @ts-expect-error - excess key
  await $betterFetch('/api/items/42', { method: 'put', body: { qty: 1, x: 1 } })
  const id = '42' as string
  await $betterFetch(`/api/items/${id}`, { method: 'post', body: { qty: 1 } })

  // --- 6. params omitted family-wide; headers vanilla ------------------------------------
  // @ts-expect-error - params
  await $betterFetch('/api/users', { params: { search: 'x' } })
  // @ts-expect-error - nor on an unbranded route
  await $betterFetch('/api/plain', { params: { a: 1 } })
  await $betterFetch('/api/users', {
    headers: { 'x-any': 'thing' },
    query: { search: 'x' },
  })

  // --- 7. vanilla degradation (amended 2026-08-22: unbranded keeps body on get) --------
  await $betterFetch('/api/plain', { query: { anything: 1, goes: true } })
  await $betterFetch('/api/errors-only', {
    method: 'post',
    body: 'raw string',
    query: { a: 1 },
  })
  await $betterFetch('/api/params-only/x', {
    method: 'post',
    body: new FormData(),
    query: { a: 1 },
  })
  await $betterFetch('https://example.com/x', {
    method: 'post',
    body: { a: 1 },
    query: { b: 2 },
  })
  await $betterFetch('/api/plain', { method: 'get', body: 'x' })
  type _keys = Expect<
    Equal<
      keyof BetterRequestOptions<'/api/plain', 'get'>,
      Exclude<keyof VanillaFetchOptions<'/api/plain'>, 'params'>
    >
  >
  type VanillaPost = BetterRequestOptions<'/api/errors-only', 'post'>
  type _postKeys = Expect<
    Equal<
      keyof VanillaPost,
      Exclude<keyof VanillaFetchOptions<'/api/errors-only'>, 'params'>
    >
  >
  type _bodyVanilla = Expect<
    Equal<VanillaPost['body'], VanillaFetchOptions<'/api/errors-only'>['body']>
  >
  await $betterFetch(new Request('https://x'), {
    method: 'post',
    body: { a: 1 },
  })

  // --- 8. .try: exhaustive on _tag, request-failed for everything else -------------------
  const { data, error } = await $betterFetch.try('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })
  if (error) {
    type _union = Expect<Equal<typeof error, UsersPostErrors | RequestFailed>>
    if (error._tag === 'validation-failed') {
      type _issues = Expect<
        Equal<typeof error.issues, ValidationFailed['issues']>
      >
    }
    return
  }
  type _data = Expect<Equal<typeof data, typeof created>>
  const r2 = await $betterFetch.try('/api/users')
  if (r2.error) {
    type _inputOnly = Expect<
      Equal<
        typeof r2.error,
        | { _tag: 'validation-failed'; issues: ValidationFailed['issues'] }
        | RequestFailed
      >
    >
  }
  const r3 = await $betterFetch.try('/api/plain')
  if (r3.error) {
    type _untyped = Expect<Equal<typeof r3.error, RequestFailed>>
  }

  // --- 9. union-typed method distributes -----------------------------------------------------
  const m = Math.random() > 0.5 ? ('post' as const) : ('get' as const)
  await $betterFetch('/api/users', {
    method: m,
    body: { name: 'a', age: '1' },
    query: { team: 't', search: 's' },
  })

  // --- 10. two handlers on one (route, method) union --------------------------------------
  await $betterFetch('/api/multi', { method: 'post', body: { qty: 1 } })
  await $betterFetch('/api/multi', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })
  // @ts-expect-error - neither handler's shape
  await $betterFetch('/api/multi', { method: 'post', body: { nope: 1 } })

  // --- 11. create(defaults) keeps per-call requiredness -------------------------------------
  const api = $betterFetch.create({ query: { team: 'default' } })
  // @ts-expect-error - query still required per call
  await api('/api/users', { method: 'post', body: { name: 'a', age: '1' } })
  const viaCreate = await api.try('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })
  if (viaCreate.error) {
    type _createTry = Expect<
      Equal<typeof viaCreate.error, UsersPostErrors | RequestFailed>
    >
  }

  // --- 12. raw shares the signature ------------------------------------------------------------
  await $betterFetch.raw('/api/users', {
    method: 'post',
    // @ts-expect-error - raw is typed the same way
    body: {},
    query: { team: 't' },
  })

  // --- 13. explicit T override ------------------------------------------------------------------
  const custom = await $betterFetch<{ custom: true }>('/api/plain')
  type _custom = Expect<Equal<typeof custom, { custom: true }>>

  // --- 14. useBetterFetch: ref / getter / plain ----------------------------------------------
  const body = ref({ name: 'a', age: '1' })
  const a = useBetterFetch('/api/users', {
    method: 'post',
    body,
    query: () => ({ team: 't' }),
  })
  type _useData = Expect<Equal<typeof a.data.value, typeof created | undefined>>
  type _useErr = Expect<
    Equal<typeof a.error.value, KnownErrorFor<'/api/users', 'post'> | undefined>
  >
  useBetterFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't', page: ref(1) },
  })
  // @ts-expect-error - required body on useBetterFetch too
  useBetterFetch('/api/users', { method: 'post', query: { team: 't' } })
  useBetterFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - excess key on a plain literal body
    body: { name: 'a', age: '1', extra: 1 },
    query: { team: 't' },
  })
  // Documented caveat: through a getter or ref() the excess check does not fire.
  useBetterFetch('/api/users', {
    method: 'post',
    body: () => ({ name: 'a', age: '1', extra: 1 }),
    query: { team: 't' },
  })
  useBetterFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - a wrong value type through a getter is still caught
    body: () => ({ name: 'a', age: 1 }),
    query: { team: 't' },
  })
  const b = useBetterFetch('/api/users')
  type _useGet = Expect<
    Equal<typeof b.data.value, { users: string[] } | undefined>
  >
  // @ts-expect-error - params gone here too
  useBetterFetch('/api/users', { params: { a: 1 } })
  useBetterFetch('/api/plain', { query: { anything: ref(1) } })
}
