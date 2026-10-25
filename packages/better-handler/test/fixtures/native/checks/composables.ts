/**
 * `useBetterFetch`, `useLazyBetterFetch`, `useBetterAsyncData`,
 * `useLazyBetterAsyncData` and `useRequestBetterFetch` call sites to this
 * app's routes, each composable reached as the app reaches it: through the
 * auto-imports Nuxt generates. Compiled by `test/e2e/native-engine.test.ts`
 * as `better-fetch.ts` is: exactly the diagnostics its `// refused TS<code>`
 * markers name, one per marked line, the same under both route engines.
 *
 * No `@ts-expect-error`: a directive over a call would also swallow a
 * stack-depth error, and a refusal is asserted by its code and line instead.
 */

import { matchError } from '@dphonys/better-handler/shared'
import type {
  BetterFetch,
  KnownErrorFor,
  RequestFailed,
  ValidationIssue,
} from '@dphonys/better-handler/types'
import type { NuxtError } from 'nuxt/app'
import { ref } from 'vue'

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

/** What `/api/users` answers on `post`, the handler's own return. */
interface Created {
  id: string
  team: string
  page: number
  age: number
}

/** What `/api/users` answers on `get`. */
interface UserList {
  users: string[]
}

/** What `/api/everything/:id` answers on `post`: the status map's bodies. */
type Document = { id: string; title: string } | null

/** The Built-in validation-failed variant, as it arrives. */
interface ValidationFailedArrived {
  _tag: 'validation-failed'
  issues: ValidationIssue[]
}

/** The Tagged error inside the body of an error ref's `NuxtError`. */
type TaggedIn<Ref> =
  NonNullable<Ref> extends NuxtError<infer Body>
    ? Body extends { data: infer Variant }
      ? Variant
      : never
    : never

/** `useBetterFetch`: the options typed per route and method, the refs too. */
export function useBetterFetchCallSites(): void {
  const created = useBetterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _Data = Expect<Equal<typeof created.data.value, Created | undefined>>
  type _Error = Expect<
    Equal<
      typeof created.error.value,
      KnownErrorFor<'/api/users', 'post'> | undefined
    >
  >
  type _Tagged = Expect<
    Equal<
      TaggedIn<typeof created.error.value>,
      { _tag: 'forbidden' } | ValidationFailedArrived
    >
  >

  // The method in either case types the same call.
  const _upper = useBetterFetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _UpperData = Expect<
    Equal<typeof _upper.data.value, typeof created.data.value>
  >
  type _UpperError = Expect<
    Equal<typeof _upper.error.value, typeof created.error.value>
  >

  useBetterFetch('/api/users', {
    method: 'Post', // refused TS2820
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  // `get` by default, with its own response and an all-optional query.
  const _listed = useBetterFetch('/api/users')

  type _Listed = Expect<
    Equal<typeof _listed.data.value, { users: string[] } | undefined>
  >

  useBetterFetch('/api/users', { query: { search: 'x' } })
  useBetterFetch('/api/users', { body: { a: 1 } }) // refused TS2353

  // Required, closed and typed as the schema's input, as on `$betterFetch`.
  useBetterFetch('/api/users', { method: 'post', query: { team: 'core' } }) // refused TS2345
  useBetterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36', admin: true }, // refused TS2353
    query: { team: 'core' },
  })
  useBetterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: 36 }, // refused TS2322
    query: { team: 'core' },
  })
  useBetterFetch('/api/users', { params: { search: 'x' } }) // refused TS2353

  // Each source plain, through a ref, or through a getter.
  const body = ref({ name: 'Ada', age: '36' })

  useBetterFetch('/api/users', {
    method: 'post',
    body,
    query: () => ({ team: 'core' }),
  })
  useBetterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core', page: ref(2) },
  })

  // A getter's wrong value is still caught.
  useBetterFetch('/api/users', {
    method: 'post',
    body: () => ({ name: 'Ada', age: 36 }), // refused TS2322
    query: { team: 'core' },
  })

  // Declared headers, a status map, and a request path from a getter.
  const _document = useBetterFetch(() => '/api/everything/1', {
    method: 'post',
    headers: { 'x-tenant': 'acme' },
    body: { title: 't', tags: [], meta: { draft: false } },
  })

  type _Document = Expect<
    Equal<typeof _document.data.value, Document | undefined>
  >
  type _DocumentErrors = Expect<
    Equal<
      TaggedIn<typeof _document.error.value>,
      | { _tag: 'doc-locked'; by: string }
      | { _tag: 'doc-gone' }
      | ValidationFailedArrived
    >
  >

  useBetterFetch('/api/everything/1', {
    method: 'post',
    headers: { 'x-tenant': 7 }, // refused TS2322
    body: { title: 't', tags: [], meta: { draft: false } },
  })

  // A route this package does not type: vanilla's options and error.
  const _plain = useBetterFetch('/api/plain', { query: { anything: ref(1) } })

  type _PlainError = Expect<
    Equal<typeof _plain.error.value, NuxtError<unknown> | undefined>
  >

  // Nuxt's own options pass through.
  const _picked = useBetterFetch('/api/users', {
    lazy: true,
    server: false,
    watch: false,
    key: 'users',
  })

  // The error ref goes to `matchError` as it is, one arm per variant.
  matchError(
    created.error,
    {
      forbidden: () => {},
      'validation-failed': ({ issues }) => issues.length,
      'request-failed': ({ status }) => status,
    },
    () => {}
  )
  matchError(
    created.error,
    { forbidden: () => {}, 'request-failed': () => {} }, // refused TS2345
    () => {}
  )
}

/** `useLazyBetterFetch`: the same signature, over Nuxt's lazy twin. */
export function useLazyBetterFetchCallSites(): void {
  const _created = useLazyBetterFetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _Data = Expect<Equal<typeof _created.data.value, Created | undefined>>
  type _Error = Expect<
    Equal<
      typeof _created.error.value,
      KnownErrorFor<'/api/users', 'post'> | undefined
    >
  >

  useLazyBetterFetch('/api/users', { method: 'POST', query: { team: 'c' } }) // refused TS2345
}

/** `useBetterAsyncData`: the handler's `.try` result, unwrapped. */
export async function useBetterAsyncDataCallSites(): Promise<void> {
  const document = await useBetterAsyncData('document', () =>
    $betterFetch.try('/api/everything/1', {
      method: 'post',
      headers: { 'x-tenant': 'acme' },
      body: { title: 't', tags: [], meta: { draft: false } },
    })
  )

  type _Data = Expect<Equal<typeof document.data.value, Document | undefined>>
  type _Error = Expect<
    Equal<
      typeof document.error.value,
      KnownErrorFor<'/api/everything/1', 'post'> | undefined
    >
  >

  // Keyless, as the compiler keys it.
  const _users = useBetterAsyncData(() =>
    $betterFetch.try('/api/users', {
      method: 'post',
      body: { name: 'Ada', age: '36' },
      query: { team: 'core' },
    })
  )

  type _Users = Expect<Equal<typeof _users.data.value, Created | undefined>>
  type _UsersTagged = Expect<
    Equal<
      TaggedIn<typeof _users.error.value>,
      { _tag: 'forbidden' } | ValidationFailedArrived
    >
  >

  // `transform`, `pick` and `default` see the success, never the result.
  const _titled = useBetterAsyncData(
    'title',
    () => $betterFetch.try('/api/users', { method: 'get' }),
    { transform: (listed) => listed.users.length }
  )

  type _Titled = Expect<Equal<typeof _titled.data.value, number | undefined>>

  const _picked = useBetterAsyncData(
    'picked',
    () => $betterFetch.try('/api/users'),
    { pick: ['users'] }
  )

  type _Picked = Expect<
    Equal<typeof _picked.data.value, { users: string[] } | undefined>
  >

  const defaulted = useBetterAsyncData(
    'defaulted',
    () => $betterFetch.try('/api/users'),
    { default: (): UserList => ({ users: [] }) }
  )

  // As vanilla's: the default's own type beside the response's, and never
  // `undefined`.
  type _Defaulted = Expect<
    Equal<Extract<typeof defaulted.data.value, undefined>, never>
  >
  const _defaultUsers: string[] = defaulted.data.value.users

  // A route declaring no errors: Nuxt's own error, untyped body.
  const _plain = useBetterAsyncData('plain', () =>
    $betterFetch.try('/api/plain')
  )

  type _PlainError = Expect<
    Equal<typeof _plain.error.value, NuxtError<unknown> | undefined>
  >

  // The request-bound fetch's `.try` feeds it the same way.
  const _thing = useBetterAsyncData('thing', () =>
    useRequestBetterFetch().try('/api/thing', { method: 'DELETE' })
  )

  type _ThingTagged = Expect<
    Equal<
      TaggedIn<typeof _thing.error.value>,
      { _tag: 'thing-missing'; id: number }
    >
  >

  // A handler resolving to plain data forgot `.try`.
  useBetterAsyncData('raw', () => $betterFetch('/api/users')) // refused TS2769

  // A handler takes what vanilla's handler is handed.
  useBetterAsyncData('app', (nuxtApp) => {
    void nuxtApp?.payload

    return $betterFetch.try('/api/users')
  })

  matchError(
    document.error,
    {
      'doc-locked': ({ by }) => by,
      'doc-gone': () => {},
      'validation-failed': () => {},
      'request-failed': ({ cause }) => cause.statusCode,
    },
    () => {}
  )
}

/** `useLazyBetterAsyncData`: the same signature, over Nuxt's lazy twin. */
export function useLazyBetterAsyncDataCallSites(): void {
  const _thing = useLazyBetterAsyncData('thing', () =>
    $betterFetch.try('/api/thing', { method: 'delete' })
  )

  type _ThingError = Expect<
    Equal<
      typeof _thing.error.value,
      KnownErrorFor<'/api/thing', 'delete'> | undefined
    >
  >

  useLazyBetterAsyncData('raw', () => $betterFetch('/api/thing')) // refused TS2769
}

/** `useRequestBetterFetch`: the call and `.try`, typed as the global is. */
export async function useRequestBetterFetchCallSites(): Promise<void> {
  const fetch = useRequestBetterFetch()

  type _Instance = Expect<Equal<typeof fetch, BetterFetch>>

  const _created = await fetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _Created = Expect<Equal<typeof _created, Created>>

  const tried = await fetch.try('/api/thing', { method: 'delete' })

  if (tried.error) {
    type _ThingErrors = Expect<
      Equal<
        typeof tried.error,
        { _tag: 'thing-missing'; id: number } | RequestFailed
      >
    >
  }

  await fetch('/api/users', { method: 'post', query: { team: 'core' } }) // refused TS2345
}
