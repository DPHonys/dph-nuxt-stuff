import type { NitroFetchOptions } from 'nitropack/types'
import { it } from 'vitest'
import type {
  TypedRequestOptions,
  ValidationFailed,
} from '../../src/runtime/types'
import type { Assert, Equal } from './assert'
import type {
  Forbidden,
  Item,
  MapsAreAugmented,
  UserCreated,
  UserCreateInput,
} from './request-routes'

/**
 * The Typed fetch family's request-side contract over the hand-written map in
 * `request-routes.ts`, asserted by the compiler under `pnpm typecheck`. Bare
 * `@ts-expect-error`: a line that compiles where it must not is itself an
 * error (TS2578), so a green typecheck means every row held.
 *
 * Ported from the ticket 10 prototype with its one divergence flipped: `body`
 * is omitted on `get`/`head` for **branded** routes only, so an unbranded
 * route stays `NitroFetchOptions<R>` minus `params`, key for key.
 *
 * Hand-written because fifty-one routes is the size the stack-depth rules
 * have to hold at, and no playground is that. The same rows re-pointed onto
 * the map the emitter really writes live in
 * `playground/request-typing.check.ts`, over that app's own routes.
 */

// The global is ambient - `/types` declares it, and nothing binds it here.
declare const $typedFetch: typeof globalThis.$typedFetch

// The fixture really merged into both map interfaces - an augmentation that
// silently opened a second, unrelated interface would leave every row below
// asserting the degraded reading and still pass.
type _ErrorsMapAugmented = Assert<
  Equal<MapsAreAugmented[0]['/api/plain']['get'], never>
>
type _InputsMapAugmented = Assert<
  Equal<MapsAreAugmented[1]['/api/users']['post'], UserCreateInput>
>

/** Declared sources are required, typed as the wire sends them, and closed. */
export async function declaredSources(): Promise<void> {
  const _created = await $typedFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    query: { team: 't', page: 2 },
  })
  type _resp = Assert<Equal<typeof _created, UserCreated>>

  // @ts-expect-error - body is required on the declared route
  await $typedFetch('/api/users', { method: 'post', query: { team: 't' } })
  // @ts-expect-error - query (tuple-intersected; `team` required) is required
  await $typedFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
  })
  await $typedFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - the output type (`age: number`) is not what the wire takes
    body: { name: 'a', age: 30 },
    query: { team: 't' },
  })
  await $typedFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - excess key on body
    body: { name: 'a', age: '30', extra: 1 },
    query: { team: 't' },
  })
  await $typedFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    // @ts-expect-error - excess key on query
    query: { team: 't', nope: 1 },
  })
  await $typedFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    // @ts-expect-error - the tuple intersects: `team` is required even when `page` is given
    query: { page: 1 },
  })
}

/** The method: `get` by default, either case, and it keys the lookup. */
export async function methodSelection(): Promise<void> {
  const _listed = await $typedFetch('/api/users')
  type _get = Assert<Equal<typeof _listed, { users: string[] }>>

  const _searched = await $typedFetch('/api/users', { query: { search: 'x' } })
  type _get2 = Assert<Equal<typeof _searched, { users: string[] }>>

  const _upper = await $typedFetch('/api/users', {
    method: 'POST',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })
  type _upperResp = Assert<Equal<typeof _upper, UserCreated>>

  // @ts-expect-error - excess query key on the get route: an all-optional schema still closes it
  await $typedFetch('/api/users', { query: { search: 'x', zzz: 1 } })
  // @ts-expect-error - body is omitted entirely on a branded get - not even vanilla's
  await $typedFetch('/api/users', { body: { anything: 1 } })

  // An all-optional query schema leaves `query` optional.
  await $typedFetch('/api/users', { method: 'get' })
  await $typedFetch('/api/users', { method: 'GET', query: {} })
}

/** A declared `body` is the schema's input, never a raw carrier. */
export async function rawCarriersRejected(): Promise<void> {
  await $typedFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - a string body
    body: '{"name":"a"}',
    query: { team: 't' },
  })
  await $typedFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - a FormData body
    body: new FormData(),
    query: { team: 't' },
  })
}

/** A `default` (method-less) handler answers every verb it is not keyed for. */
export async function defaultHandler(): Promise<void> {
  const _got = await $typedFetch('/api/items/42')
  type _default = Assert<Equal<typeof _got, Item>>

  await $typedFetch('/api/items/42', { method: 'post', body: { qty: 1 } })
  // @ts-expect-error - post on the default handler requires the declared body
  await $typedFetch('/api/items/42', { method: 'post' })
  // @ts-expect-error - excess key
  await $typedFetch('/api/items/42', { method: 'put', body: { qty: 1, x: 1 } })

  // A template-literal route resolves through `MatchedRoutes` just the same.
  const id: string = '42'
  await $typedFetch(`/api/items/${id}`, { method: 'post', body: { qty: 1 } })
}

/** `params` is gone family-wide; `headers` is vanilla's, untouched. */
export async function optionsSurface(): Promise<void> {
  // @ts-expect-error - ofetch's deprecated alias is not a back door
  await $typedFetch('/api/users', { params: { search: 'x' } })
  // @ts-expect-error - nor on an unbranded route
  await $typedFetch('/api/plain', { params: { a: 1 } })

  await $typedFetch('/api/users', {
    headers: { 'x-any': 'thing' },
    query: { search: 'x' },
  })

  type Headers_ = TypedRequestOptions<'/api/users', 'get'>['headers']
  type _headersVanilla = Assert<
    Equal<Headers_, NitroFetchOptions<'/api/users', 'get'>['headers']>
  >
}

/** A route that declares nothing types exactly as vanilla, key for key. */
export async function vanillaDegradation(): Promise<void> {
  await $typedFetch('/api/plain', { query: { anything: 1, goes: true } })
  await $typedFetch('/api/errors-only', {
    method: 'post',
    body: 'raw string',
    query: { a: 1 },
  })
  await $typedFetch('/api/params-only/x', {
    method: 'post',
    body: new FormData(),
    query: { a: 1 },
  })
  await $typedFetch('https://example.com/x', {
    method: 'post',
    body: { a: 1 },
    query: { b: 2 },
  })

  // The ticket 10 flip: `body` on `get` is vanilla's own on an unbranded
  // route, so it stays. Omitting it family-wide would break the promise below.
  await $typedFetch('/api/plain', { method: 'get', body: 'x' })

  type VanillaGet = TypedRequestOptions<'/api/plain', 'get'>
  type _getKeys = Assert<
    Equal<
      keyof VanillaGet,
      Exclude<keyof NitroFetchOptions<'/api/plain'>, 'params'>
    >
  >
  type _getBody = Assert<
    Equal<VanillaGet['body'], NitroFetchOptions<'/api/plain'>['body']>
  >

  type VanillaPost = TypedRequestOptions<'/api/errors-only', 'post'>
  type _postKeys = Assert<
    Equal<
      keyof VanillaPost,
      Exclude<keyof NitroFetchOptions<'/api/errors-only'>, 'params'>
    >
  >
  type _bodyVanilla = Assert<
    Equal<VanillaPost['body'], NitroFetchOptions<'/api/errors-only'>['body']>
  >
  type _queryVanilla = Assert<
    Equal<VanillaPost['query'], NitroFetchOptions<'/api/errors-only'>['query']>
  >

  // A `Request` object carries no route path, so it degrades too.
  await $typedFetch(new Request('https://x'), {
    method: 'post',
    body: { a: 1 },
  })
}

/** Two handlers on one (route, method): every map answers a union. */
export async function multiHandlerRoute(): Promise<void> {
  await $typedFetch('/api/multi', { method: 'post', body: { qty: 1 } })
  await $typedFetch('/api/multi', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })
  await $typedFetch('/api/multi', {
    method: 'post',
    // @ts-expect-error - neither handler's shape
    body: { nope: 1 },
  })
}

/** A union-typed `method` distributes over the lookup. */
export async function unionMethod(): Promise<void> {
  const method = Math.random() > 0.5 ? ('post' as const) : ('get' as const)

  await $typedFetch('/api/users', {
    method,
    body: { name: 'a', age: '1' },
    query: { team: 't', search: 's' },
  })
}

/** `.try` folds the failure into the result, typed from the errors map. */
export async function tryResults(): Promise<void> {
  const result = await $typedFetch.try('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })

  if (result.error) {
    const variant = result.error.data!.data.__knownError__
    // The built-in variant rides the errors map: the wrapper's slot carries it.
    type _union = Assert<Equal<typeof variant, Forbidden | ValidationFailed>>

    if (variant.tag === 'validationFailed') {
      type _issues = Assert<
        Equal<typeof variant.issues, ValidationFailed['issues']>
      >
    }
  } else {
    // Narrowed by the sibling guard alone - no second check and no `!`.
    type _data = Assert<Equal<typeof result.data, UserCreated>>
  }
}

/** A `validate`-only route can still only fail one way; an unbranded one is untyped. */
export async function tryUnionEdges(): Promise<void> {
  const validateOnly = await $typedFetch.try('/api/users')

  if (validateOnly.error) {
    type _validateOnly = Assert<
      Equal<
        NonNullable<typeof validateOnly.error.data>['data']['__knownError__'],
        ValidationFailed
      >
    >
  }

  const unbranded = await $typedFetch.try('/api/plain')

  if (unbranded.error) {
    type _untyped = Assert<Equal<typeof unbranded.error.data, unknown>>
  }
}

/** `create` defaults are vanilla options: they never relax a call's requiredness. */
export async function createdInstance(): Promise<void> {
  const api = $typedFetch.create({ query: { team: 'default' } })

  // @ts-expect-error - `query` is still required per call
  await api('/api/users', { method: 'post', body: { name: 'a', age: '1' } })

  await api('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })

  const viaCreate = await api.try('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })

  if (viaCreate.error) {
    type _createTry = Assert<
      Equal<
        NonNullable<typeof viaCreate.error.data>['data']['__knownError__'],
        Forbidden | ValidationFailed
      >
    >
  }
}

/** `.raw` shares the call's signature, and an explicit `T` still overrides. */
export async function rawAndExplicitResponse(): Promise<void> {
  await $typedFetch.raw('/api/users', {
    method: 'post',
    // @ts-expect-error - typed exactly as the call is
    body: {},
    query: { team: 't' },
  })

  const _raw = await $typedFetch.raw('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })
  type _rawData = Assert<Equal<typeof _raw._data, UserCreated | undefined>>

  const _custom = await $typedFetch<{ custom: true }>('/api/plain')
  type _customResp = Assert<Equal<typeof _custom, { custom: true }>>
}

it('is asserted by the compiler', () => {})
