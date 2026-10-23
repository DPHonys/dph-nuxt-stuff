// PROTOTYPE (ticket 10), questions 3 and 5. Compiled unchanged in the flag-on
// and the flag-off program: identical diagnostics (none) and, through
// scripts/probe-types.mjs, identical resolved types for every `Probe_*`.
import type { NuxtError } from 'nuxt/app'
import { ref } from 'vue'
import { useBetterFetch } from '../../../lib/composables'
import type { VanillaFetchOptions } from '../../../lib/engine'
import type { ValidationFailed } from '../../../lib/handler'
import type {
  BetterRequestOptions,
  RequestFailed,
} from '../../../lib/request-typing'

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false
type Expect<T extends true> = T

const created = await $betterFetch('/api/users', {
  method: 'post',
  body: { name: 'a', age: '30' },
  query: { team: 't', page: 2 },
})
export type Probe_created = typeof created
type _created = Expect<
  Equal<typeof created, { id: string; team: string; page: number; age: number }>
>

// @ts-expect-error - body is required on the declared route
await $betterFetch('/api/users', { method: 'post', query: { team: 't' } })
await $betterFetch('/api/users', {
  method: 'post',
  // @ts-expect-error - output type (age: number) is not the wire type
  body: { name: 'a', age: 30 },
  query: { team: 't' },
})
await $betterFetch('/api/users', {
  method: 'post',
  // @ts-expect-error - excess key on body
  body: { name: 'a', age: '1', x: 1 },
  query: { team: 't' },
})
await $betterFetch('/api/users', {
  method: 'post',
  body: { name: 'a', age: '1' },
  // @ts-expect-error - tuple query: team required
  query: { page: 1 },
})

// --- Q5: Uppercase<M> | M --------------------------------------------------
const upper = await $betterFetch('/api/users', {
  method: 'POST',
  body: { name: 'a', age: '1' },
  query: { team: 't' },
})
type _upper = Expect<Equal<typeof upper, typeof created>>
export type Probe_upper = typeof upper
type _optsUpperLower = Expect<
  Equal<
    BetterRequestOptions<'/api/users', 'POST'>['body'],
    BetterRequestOptions<'/api/users', 'post'>['body']
  >
>
type _queryUpperLower = Expect<
  Equal<
    BetterRequestOptions<'/api/users', 'POST'>['query'],
    BetterRequestOptions<'/api/users', 'post'>['query']
  >
>
export type Probe_optsPOST = BetterRequestOptions<'/api/users', 'POST'>
export type Probe_optsPost = BetterRequestOptions<'/api/users', 'post'>
// @ts-expect-error - 'POST' still requires the body
await $betterFetch('/api/users', { method: 'POST', query: { team: 't' } })
await $betterFetch('/api/users', {
  // @ts-expect-error - mixed case is not a method
  method: 'Post',
  body: { name: 'a', age: '1' },
  query: { team: 't' },
})
const upperTry = await $betterFetch.try('/api/users', {
  method: 'POST',
  body: { name: 'a', age: '1' },
  query: { team: 't' },
})
const lowerTry = await $betterFetch.try('/api/users', {
  method: 'post',
  body: { name: 'a', age: '1' },
  query: { team: 't' },
})
type _tryCase = Expect<Equal<typeof upperTry, typeof lowerTry>>
const getUpper = await $betterFetch('/api/users', {
  method: 'GET',
  query: { search: 's' },
})
const getLower = await $betterFetch('/api/users', {
  method: 'get',
  query: { search: 's' },
})
type _getCase = Expect<Equal<typeof getUpper, typeof getLower>>
// @ts-expect-error - body omitted on GET for a branded route, either case
await $betterFetch('/api/users', { method: 'GET', body: { a: 1 } })
const defaultUpper = await $betterFetch('/api/items/1', {
  method: 'PATCH',
  body: { qty: 1 },
})
const defaultLower = await $betterFetch('/api/items/1', {
  method: 'patch',
  body: { qty: 1 },
})
type _defaultCase = Expect<Equal<typeof defaultUpper, typeof defaultLower>>

// --- default method, vanilla degradation ------------------------------------
const listed = await $betterFetch('/api/users')
type _listed = Expect<Equal<typeof listed, { users: string[] }>>
await $betterFetch('/api/plain', { query: { anything: 1 } })
await $betterFetch('/api/thing', {
  method: 'delete',
  body: 'raw',
  query: { a: 1 },
})
type _vanillaKeys = Expect<
  Equal<
    keyof BetterRequestOptions<'/api/thing', 'delete'>,
    Exclude<keyof VanillaFetchOptions<'/api/thing'>, 'params'>
  >
>
// @ts-expect-error - params gone family-wide
await $betterFetch('/api/plain', { params: { a: 1 } })
// array and primitive bodies are typed by our map even though the native path is vanilla
await $betterFetch('/api/tags', { method: 'post', body: ['a'] })
// @ts-expect-error - array body element type
await $betterFetch('/api/tags', { method: 'post', body: [1] })
await $betterFetch('/api/count', { method: 'post', body: 2 })
// @ts-expect-error - primitive body type
await $betterFetch('/api/count', { method: 'post', body: '2' })
await $betterFetch('/api/multi', { method: 'post', body: { two: 2 } })

// --- .try: exhaustive on _tag ------------------------------------------------
const tried = await $betterFetch.try('/api/everything/1', {
  method: 'post',
  headers: { 'x-tenant': 't' },
  body: { title: 't', tags: [], meta: { draft: false } },
})
export type Probe_tried = typeof tried
if (tried.error) {
  type E = typeof tried.error
  type _exhaustive = Expect<
    Equal<
      E,
      | { _tag: 'doc-locked'; by: string; at: string }
      | { _tag: 'doc-gone' }
      | { _tag: 'validation-failed'; issues: ValidationFailed['issues'] }
      | RequestFailed
    >
  >
  switch (tried.error._tag) {
    case 'doc-locked':
      break
    case 'doc-gone':
      break
    case 'validation-failed':
      break
    case 'request-failed': {
      type _cause = Expect<Equal<typeof tried.error.cause, NuxtError>>
      break
    }
    default: {
      const _never: never = tried.error
      void _never
    }
  }
} else {
  type _data = Expect<
    Equal<typeof tried.data, { id: string; title: string } | null>
  >
}
const plainTry = await $betterFetch.try('/api/plain')
if (plainTry.error) {
  type _onlyRequestFailed = Expect<Equal<typeof plainTry.error, RequestFailed>>
}

// --- useBetterFetch ------------------------------------------------------------
const body = ref({ name: 'a', age: '1' })
const a = useBetterFetch('/api/users', {
  method: 'post',
  body,
  query: () => ({ team: 't' }),
})
export type Probe_useData = typeof a.data.value
export type Probe_useError = typeof a.error.value
type _useData = Expect<Equal<typeof a.data.value, typeof created | undefined>>
const aUpper = useBetterFetch('/api/users', {
  method: 'POST',
  body,
  query: { team: 't' },
})
type _useUpper = Expect<Equal<typeof aUpper.data.value, typeof a.data.value>>
// @ts-expect-error - required body on useBetterFetch too
useBetterFetch('/api/users', { method: 'post', query: { team: 't' } })
// @ts-expect-error - params gone here too
useBetterFetch('/api/users', { params: { a: 1 } })
const b = useBetterFetch('/api/users')
type _useGet = Expect<
  Equal<typeof b.data.value, { users: string[] } | undefined>
>

export type Probe_vanillaOpts = BetterRequestOptions<'/api/thing', 'delete'>
export type Probe_defaultOpts = BetterRequestOptions<'/api/items/1', 'post'>
