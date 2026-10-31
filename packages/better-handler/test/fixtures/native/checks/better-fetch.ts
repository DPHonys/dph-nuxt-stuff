/**
 * `$betterFetch`, `.try`, `.raw`, `.create` and `event.$betterFetch` call
 * sites to this app's routes. Compiled by `test/e2e/native-engine.test.ts` in
 * the program of each route engine the installed Nuxt has: the file must
 * report exactly the diagnostics its `// refused TS<code>` markers name, one
 * per marked line, and the same ones under both engines, since the fetch
 * family types every call from the generated map and Nitro's route types,
 * whatever `experimental.routeTypedFetch` says.
 *
 * No `@ts-expect-error`: a directive over a call would also swallow a
 * stack-depth error, and a refusal is asserted by its code and line instead.
 */

import type {
  BetterRequestOptions,
  KnownErrorFor,
  RequestFailed,
  ValidationIssue,
  Wire,
} from '@dphonys/better-handler/types'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import type { NitroFetchOptions } from 'nitropack/types'
import type { NuxtError } from 'nuxt/app'
import type { reportOutput } from '../server/outputs'

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

/** A valid `/api/users` body and query, kept apart to keep a call on one line. */
const ada = { name: 'Ada', age: '36' }
const team = { team: 'core' }

/** The Built-in validation-failed variant, as it arrives. */
interface ValidationFailedArrived {
  _tag: 'validation-failed'
  issues: ValidationIssue[]
}

/** Declared sources: typed as their schemas' input, required, closed. */
export async function declaredSources(): Promise<void> {
  const _created = await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core', page: 2 },
  })

  type _Created = Expect<Equal<typeof _created, Created>>

  await $betterFetch('/api/users', { method: 'post', query: { team: 'core' } }) // refused TS2345
  await $betterFetch('/api/users', { method: 'post', body: ada }) // refused TS2345

  await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: 36 }, // refused TS2322
    query: { team: 'core' },
  })

  await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36', admin: true }, // refused TS2353
    query: { team: 'core' },
  })

  await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core', nope: 1 }, // refused TS2353
  })

  // A tuple-composed query needs every element's required keys.
  await $betterFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36' },
    query: { page: 1 }, // refused TS2741
  })

  // A declared body is the schema's input, never a raw carrier.
  await $betterFetch('/api/users', {
    method: 'post',
    body: '{"name":"Ada"}', // refused TS2322
    query: { team: 'core' },
  })
  await $betterFetch('/api/users', {
    method: 'post',
    body: new FormData(), // refused TS2739
    query: { team: 'core' },
  })

  // An array and a primitive body: typed by our map, where the native path
  // reads nothing.
  await $betterFetch('/api/tags', { method: 'post', body: ['a'] })
  await $betterFetch('/api/tags', { method: 'post', body: [1] }) // refused TS2322
  await $betterFetch('/api/count', { method: 'post', body: 2 })
  await $betterFetch('/api/count', { method: 'post', body: '2' }) // refused TS2322

  // Two handlers on one route and method: either handler's body.
  await $betterFetch('/api/multi', { method: 'post', body: { one: 'a' } })
  await $betterFetch('/api/multi', { method: 'post', body: { two: 2 } })
  await $betterFetch('/api/multi', { method: 'post', body: { nope: 1 } }) // refused TS2353

  // A coerce query: the coerce value takes anything, the other keys are exact.
  await $betterFetch('/api/search', { query: { q: 'nuxt', page: 2 } })
  await $betterFetch('/api/search', { query: { q: 'nuxt', page: '2' } })
  await $betterFetch('/api/search', { query: { q: 7 } }) // refused TS2322
  await $betterFetch('/api/search', {}) // refused TS2345

  // Required iff `{} extends` the input is false: a body any value
  // satisfies is optional, while a record admitting `undefined` is required,
  // `undefined` being a value it takes.
  await $betterFetch('/api/unknown-body', { method: 'post' })
  await $betterFetch('/api/unknown-body', { method: 'post', body: 'anything' })
  await $betterFetch('/api/optional-body', { method: 'post', body: undefined })
  await $betterFetch('/api/optional-body', { method: 'post' }) // refused TS2345
}

/**
 * The options argument itself: required exactly when a declared source must
 * be sent, on every member of the family, so leaving it out, or passing
 * `undefined` for it, is refused where `{}` would be.
 */
export async function requiredOptions(event: H3Event): Promise<void> {
  await $betterFetch('/api/search') // refused TS2554
  await $betterFetch('/api/search', undefined) // refused TS2345
  await $betterFetch('/api/headers-only') // refused TS2554
  await $betterFetch.raw('/api/search') // refused TS2554
  await $betterFetch.try('/api/search') // refused TS2554
  await $betterFetch.create({})('/api/search') // refused TS2554
  await event.$betterFetch('/api/search') // refused TS2554
  await event.$betterFetch.try('/api/search') // refused TS2554

  // Omissible wherever sending no options passes: an all-optional input, a
  // route this package does not type, a `Request`, an explicit response type.
  await $betterFetch('/api/users')
  await $betterFetch('/api/users', undefined)
  await $betterFetch.raw('/api/users')
  await $betterFetch.try('/api/users')
  await event.$betterFetch('/api/users')
  await event.$betterFetch.try('/api/users')
  await $betterFetch('/api/plain')
  await $betterFetch('https://example.com/x')
  await $betterFetch(new Request('https://example.com/x'))
  await $betterFetch<{ custom: true }>('/api/plain')
}

/** Declared headers: the keys they name typed, every other header open. */
export async function declaredHeaders(): Promise<void> {
  await $betterFetch('/api/headers-only', { headers: { 'x-tenant': 'acme' } })
  await $betterFetch('/api/headers-only', {
    headers: { 'x-tenant': 'acme', authorization: 'Bearer t' },
  })
  await $betterFetch('/api/headers-only', { headers: { accept: 'text/csv' } }) // refused TS2322
  await $betterFetch('/api/headers-only', { headers: new Headers() }) // refused TS2322
  await $betterFetch('/api/headers-only', {}) // refused TS2345

  // Undeclared headers are vanilla's, every form included.
  await $betterFetch('/api/users', { headers: new Headers() })
  await $betterFetch('/api/plain', { headers: [['x-trace', '7']] })
}

/** The method: `get` by default, either case, and it keys the lookup. */
export async function methodSelection(): Promise<void> {
  const _listed = await $betterFetch('/api/users')

  type _Listed = Expect<Equal<typeof _listed, { users: string[] }>>

  // An all-optional query stays optional, and closed.
  await $betterFetch('/api/users', { method: 'get' })
  await $betterFetch('/api/users', { method: 'GET', query: {} })
  await $betterFetch('/api/users', { query: { search: 'x', zzz: 1 } }) // refused TS2353

  // No `body` at all on a branded route's `get`, in either case.
  await $betterFetch('/api/users', { body: { a: 1 } }) // refused TS2353
  await $betterFetch('/api/users', { method: 'GET', body: { a: 1 } }) // refused TS2353
  await $betterFetch('/api/report', { body: { a: 1 } }) // refused TS2353

  const _upper = await $betterFetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _UpperCase = Expect<Equal<typeof _upper, Created>>
  type _BodyEitherCase = Expect<
    Equal<
      BetterRequestOptions<'/api/users', 'POST'>['body'],
      BetterRequestOptions<'/api/users', 'post'>['body']
    >
  >
  type _QueryEitherCase = Expect<
    Equal<
      BetterRequestOptions<'/api/users', 'POST'>['query'],
      BetterRequestOptions<'/api/users', 'post'>['query']
    >
  >

  await $betterFetch('/api/users', { method: 'POST', query: { team: 'core' } }) // refused TS2345

  await $betterFetch('/api/users', {
    method: 'Post', // refused TS2820
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  // A method-less handler answers every method, its body on all but `get`.
  const _item = await $betterFetch('/api/items/7')

  type _Item = Expect<Equal<typeof _item, { item: string; qty: number }>>

  const _patched = await $betterFetch('/api/items/7', {
    method: 'PATCH',
    body: { qty: 1 },
  })
  const _patchedLower = await $betterFetch('/api/items/7', {
    method: 'patch',
    body: { qty: 1 },
  })

  type _DefaultEitherCase = Expect<Equal<typeof _patched, typeof _patchedLower>>

  await $betterFetch('/api/items/7', { method: 'post' }) // refused TS2345
  await $betterFetch('/api/items/7', { method: 'put', body: { qty: 1, x: 1 } }) // refused TS2353

  // A template-literal path resolves through Nitro's matching just the same.
  const id: string = '7'
  await $betterFetch(`/api/items/${id}`, { method: 'post', body: { qty: 1 } })

  // A union-typed method distributes over the lookup.
  const method = Math.random() > 0.5 ? ('post' as const) : ('get' as const)
  await $betterFetch('/api/users', {
    method,
    body: { name: 'Ada', age: '36' },
    query: { team: 'core', search: 's' },
  })
}

/** A route this package does not type keeps vanilla's options, key for key. */
export async function vanillaDegradation(): Promise<void> {
  await $betterFetch('/api/plain', { query: { anything: 1, goes: true } })
  await $betterFetch('/api/plain', { method: 'get', body: 'raw' })
  await $betterFetch('/api/native', { method: 'post', body: { anything: 1 } })
  await $betterFetch('https://example.com/x', {
    method: 'post',
    body: { a: 1 },
  })
  await $betterFetch(new Request('https://example.com/x'), { body: { a: 1 } })

  type VanillaGet = BetterRequestOptions<'/api/plain', 'get'>

  type _GetKeys = Expect<
    Equal<
      keyof VanillaGet,
      Exclude<keyof NitroFetchOptions<'/api/plain'>, 'params'>
    >
  >
  type _GetBody = Expect<
    Equal<VanillaGet['body'], NitroFetchOptions<'/api/plain'>['body']>
  >
  type _GetQuery = Expect<
    Equal<VanillaGet['query'], NitroFetchOptions<'/api/plain'>['query']>
  >
  type _GetHeaders = Expect<
    Equal<VanillaGet['headers'], NitroFetchOptions<'/api/plain'>['headers']>
  >

  // A route of this package declaring no source: vanilla `body` and `query`
  // on a method that takes a body.
  await $betterFetch('/api/thing', { method: 'delete', body: 'raw', query: {} })

  type ErrorsOnly = BetterRequestOptions<'/api/thing', 'delete'>

  type _ErrorsOnlyKeys = Expect<
    Equal<
      keyof ErrorsOnly,
      Exclude<keyof NitroFetchOptions<'/api/thing'>, 'params'>
    >
  >
  type _ErrorsOnlyBody = Expect<
    Equal<ErrorsOnly['body'], NitroFetchOptions<'/api/thing'>['body']>
  >

  // `route` is a Validation source, never an option: the path carries it.
  type RouteOnly = BetterRequestOptions<'/api/route-only/x', 'get'>

  type _NoRouteOption = Expect<Equal<Extract<keyof RouteOnly, 'route'>, never>>
  type _RouteOnlyQuery = Expect<
    Equal<RouteOnly['query'], NitroFetchOptions<'/api/route-only/x'>['query']>
  >

  // ofetch's deprecated `params` alias is no back door, on any route.
  await $betterFetch('/api/users', { params: { search: 'x' } }) // refused TS2353
  await $betterFetch('/api/plain', { params: { a: 1 } }) // refused TS2353
}

/** The response: the declared output's output type, as it crosses the wire. */
export async function responses(): Promise<void> {
  const _report = await $betterFetch('/api/report')

  type _ReportIsOutput = Expect<
    Equal<
      typeof _report,
      Wire<StandardSchemaV1.InferOutput<typeof reportOutput>>
    >
  >
  type _ReportArrives = Expect<
    Equal<typeof _report, { total: number; at: string }>
  >

  const _document = await $betterFetch('/api/everything/1', {
    method: 'post',
    headers: { 'x-tenant': 'acme' },
    body: { title: 't', tags: [], meta: { draft: false } },
  })

  type _StatusMap = Expect<
    Equal<typeof _document, { id: string; title: string } | null>
  >

  // An explicit type argument still overrides, as on vanilla.
  const _custom = await $betterFetch<{ custom: true }>('/api/plain')

  type _Custom = Expect<Equal<typeof _custom, { custom: true }>>

  // `.raw` shares the call's typing.
  const _raw = await $betterFetch.raw('/api/report')

  type _RawData = Expect<
    Equal<typeof _raw._data, { total: number; at: string } | undefined>
  >
  type _RawResponse = Expect<
    Equal<Omit<typeof _raw, '_data'>, Omit<Response, '_data'>>
  >

  await $betterFetch.raw('/api/users', {
    method: 'post',
    body: {}, // refused TS2739
    query: { team: 'core' },
  })
}

/** `.try`: the result, exhaustive on `_tag` through the generated map. */
export async function tryResults(): Promise<void> {
  const tried = await $betterFetch.try('/api/everything/1', {
    method: 'post',
    headers: { 'x-tenant': 'acme' },
    body: { title: 't', tags: [], meta: { draft: false } },
  })

  if (tried.error) {
    type _Exhaustive = Expect<
      Equal<
        typeof tried.error,
        | { _tag: 'doc-locked'; by: string }
        | { _tag: 'doc-gone' }
        | ValidationFailedArrived
        | RequestFailed
      >
    >

    switch (tried.error._tag) {
      case 'doc-locked':
        type _By = Expect<Equal<typeof tried.error.by, string>>
        break
      case 'doc-gone':
      case 'validation-failed':
        break
      case 'request-failed': {
        type _Cause = Expect<Equal<typeof tried.error.cause, NuxtError>>
        type _Status = Expect<
          Equal<typeof tried.error.status, number | undefined>
        >
        break
      }
      default: {
        const unreachable: never = tried.error
        void unreachable
      }
    }
  } else {
    // Narrowed by the sibling alone, with no second guard.
    type _Data = Expect<
      Equal<typeof tried.data, { id: string; title: string } | null>
    >
  }

  // A route declaring no errors fails only one way.
  const plain = await $betterFetch.try('/api/plain')

  if (plain.error) {
    type _OnlyRequestFailed = Expect<Equal<typeof plain.error, RequestFailed>>
  }

  // The method in either case keys the same union.
  const _upper = await $betterFetch.try('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })
  const lower = await $betterFetch.try('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _TryEitherCase = Expect<Equal<typeof _upper, typeof lower>>

  if (lower.error) {
    type _UsersErrors = Expect<
      Equal<
        typeof lower.error,
        { _tag: 'forbidden' } | ValidationFailedArrived | RequestFailed
      >
    >
  }

  // `.try` takes the call's options, refusals included.
  await $betterFetch.try('/api/users', { method: 'post', query: team }) // refused TS2345

  // What the throwing call rejects with.
  type _Thrown = Expect<
    Equal<
      KnownErrorFor<'/api/thing', 'DELETE'>,
      NuxtError<{
        error: true
        url: string
        statusCode: number
        statusMessage: string
        message: string
        data: { _tag: 'thing-missing'; id: number }
      }>
    >
  >
}

/** `.create`: vanilla defaults, which never relax a call's requiredness. */
export async function createdInstance(): Promise<void> {
  const api = $betterFetch.create({ query: { team: 'default' } })

  await api('/api/users', { method: 'post', body: { name: 'Ada', age: '36' } }) // refused TS2345

  const created = await api.try('/api/users', {
    method: 'post',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  if (!created.error) {
    type _CreatedThroughCreate = Expect<Equal<typeof created.data, Created>>
  }
}

/** `event.$betterFetch`: the call and `.try`, typed as the global is. */
export async function eventBound(event: H3Event): Promise<void> {
  type _OnlyTry = Expect<Equal<keyof H3Event['$betterFetch'], 'try'>>

  const _created = await event.$betterFetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: '36' },
    query: { team: 'core' },
  })

  type _Created = Expect<Equal<typeof _created, Created>>

  const tried = await event.$betterFetch.try('/api/thing', { method: 'delete' })

  if (tried.error) {
    type _ThingErrors = Expect<
      Equal<
        typeof tried.error,
        { _tag: 'thing-missing'; id: number } | RequestFailed
      >
    >
  }

  await event.$betterFetch('/api/users', { method: 'post', query: team }) // refused TS2345
}
