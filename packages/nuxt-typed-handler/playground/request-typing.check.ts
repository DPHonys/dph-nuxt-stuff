import type { TypedRequestOptions } from '@dphonys/nuxt-typed-handler/types'
import type { NitroFetchOptions } from 'nitropack/types'

/**
 * The Typed fetch family's request-side contract, re-pointed off the
 * hand-written map in `test/types/request-routes.ts` and onto the **real**
 * one: every row below reads `.nuxt/types/nuxt-typed-handler.d.ts` as this
 * app's `nuxt prepare` wrote it, from the routes in `server/api/`.
 *
 * It lives in an app because that map only exists inside one, and it is
 * compiler-asserted: `pnpm typecheck` runs `vue-tsc` over this project. Bare
 * `@ts-expect-error` throughout - a line that compiles where it must not is
 * itself an error (TS2578), so a green run means every row held.
 */

/**
 * The package's own `test/types/assert.ts`, restated: the playground is a
 * separate workspace, and reaching across into the package's test tree from
 * an app would be a stranger dependency than these six lines.
 */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

/** `/api/users` declares a body: required, typed as the wire sends it, closed. */
export async function declaredBody(): Promise<void> {
  const _created = await $typedFetch('/api/users', {
    method: 'post',
    body: { name: 'Ada', email: 'ada@example.com' },
  })
  type _resp = Assert<Equal<typeof _created, { created: string }>>

  // @ts-expect-error - the declared body is required
  await $typedFetch('/api/users', { method: 'post' })

  await $typedFetch('/api/users', {
    method: 'POST',
    // @ts-expect-error - excess key on the declared body
    body: { name: 'Ada', email: 'ada@example.com', extra: 1 },
  })

  await $typedFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - a raw carrier is not the schema's input
    body: '{"name":"Ada"}',
  })
}

/** `/api/search` composes two query schemas: the wire satisfies both. */
export async function tupleQuery(): Promise<void> {
  const _page = await $typedFetch('/api/search', {
    query: { page: '2', sort: 'name' },
  })
  // `get` is the default method, and the route is keyed on it.
  type _resp = Assert<Equal<typeof _page, { page: number; hits: string[] }>>

  // The second element is all-optional; the first is not.
  await $typedFetch('/api/search', { query: { page: '2' } })

  // @ts-expect-error - `page` comes from the first element, and is required
  await $typedFetch('/api/search', { query: { sort: 'name' } })

  // @ts-expect-error - the composed query is closed over both elements
  await $typedFetch('/api/search', { query: { page: '2', nope: 1 } })

  await $typedFetch('/api/search', {
    query: { page: '2' },
    // @ts-expect-error - `body` is omitted on a branded `get`
    body: { anything: 1 },
  })

  // @ts-expect-error - the output type (`page: number`) is not what the wire takes
  await $typedFetch('/api/search', { query: { page: 2 } })
}

/** A `default` (method-less) handler answers every verb it is not keyed for. */
export async function defaultHandler(): Promise<void> {
  const _got = await $typedFetch('/api/items')
  type _default = Assert<Equal<typeof _got, { qty: number }>>

  await $typedFetch('/api/items', { method: 'post', body: { qty: 1 } })
  // @ts-expect-error - post on the default handler requires the declared body
  await $typedFetch('/api/items', { method: 'post' })
  // @ts-expect-error - excess key on the declared body
  await $typedFetch('/api/items', { method: 'put', body: { qty: 1, x: 1 } })
}

/** A declared `body` is the schema's input, never a raw carrier. */
export async function rawCarriersRejected(): Promise<void> {
  await $typedFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - a FormData body
    body: new FormData(),
  })
}

/** A union-typed `method` distributes over the lookup, case and all. */
export async function unionMethod(): Promise<void> {
  const method = Math.random() > 0.5 ? ('post' as const) : ('POST' as const)

  await $typedFetch('/api/users', {
    method,
    body: { name: 'Ada', email: 'ada@example.com' },
  })
}

/** `create` defaults are vanilla options: they never relax a call's requiredness. */
export async function createdInstance(): Promise<void> {
  const api = $typedFetch.create({ headers: { 'x-any': 'thing' } })

  // @ts-expect-error - `body` is still required per call
  await api('/api/users', { method: 'post' })

  await api('/api/users', {
    method: 'post',
    body: { name: 'Ada', email: 'ada@example.com' },
  })

  const viaCreate = await api.try('/api/users', {
    method: 'post',
    body: { name: 'Ada', email: 'ada@example.com' },
  })

  if (viaCreate.error) {
    type _createTry = Assert<
      Equal<
        NonNullable<
          typeof viaCreate.error.data
        >['data']['__knownError__']['tag'],
        'user-exists' | 'validation-failed'
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
  })

  const _raw = await $typedFetch.raw('/api/users', {
    method: 'post',
    body: { name: 'Ada', email: 'ada@example.com' },
  })
  type _rawData = Assert<
    Equal<typeof _raw._data, { created: string } | undefined>
  >

  const _custom = await $typedFetch<{ custom: true }>('/api/legacy')
  type _customResp = Assert<Equal<typeof _custom, { custom: true }>>
}

/** `params` is gone family-wide; every other vanilla key is untouched. */
export async function optionsSurface(): Promise<void> {
  // @ts-expect-error - ofetch's deprecated alias is not a back door
  await $typedFetch('/api/search', { params: { page: '2' } })
  // @ts-expect-error - nor on an unbranded route
  await $typedFetch('/api/legacy', { params: { a: 1 } })

  await $typedFetch('/api/search', {
    headers: { 'x-any': 'thing' },
    query: { page: '2' },
  })

  type Headers_ = TypedRequestOptions<'/api/search', 'get'>['headers']
  type _headersVanilla = Assert<
    Equal<Headers_, NitroFetchOptions<'/api/search', 'get'>['headers']>
  >
}

/** A route that declares nothing types exactly as vanilla, key for key. */
export async function vanillaDegradation(): Promise<void> {
  const _legacy = await $typedFetch('/api/legacy')
  type _resp = Assert<Equal<typeof _legacy, { legacy: boolean }>>

  await $typedFetch('/api/legacy', { query: { anything: 1, goes: true } })
  // `body` on `get` is vanilla's own on an unbranded route, so it stays.
  await $typedFetch('/api/legacy', { method: 'get', body: 'x' })

  type VanillaGet = TypedRequestOptions<'/api/legacy', 'get'>
  type _getKeys = Assert<
    Equal<
      keyof VanillaGet,
      Exclude<keyof NitroFetchOptions<'/api/legacy'>, 'params'>
    >
  >
  type _getBody = Assert<
    Equal<VanillaGet['body'], NitroFetchOptions<'/api/legacy'>['body']>
  >
}

/** An `errors`-only route declares no sources, so both stay vanilla. */
export async function errorsOnlyRoute(): Promise<void> {
  await $typedFetch('/api/notes', {
    method: 'post',
    body: 'raw string',
    query: { a: 1 },
  })

  type ErrorsOnlyPost = TypedRequestOptions<'/api/notes', 'post'>
  type _bodyVanilla = Assert<
    Equal<ErrorsOnlyPost['body'], NitroFetchOptions<'/api/notes'>['body']>
  >
  type _queryVanilla = Assert<
    Equal<ErrorsOnlyPost['query'], NitroFetchOptions<'/api/notes'>['query']>
  >
}

/** `.try` folds the failure into the result, typed from the errors map. */
export async function tryResults(): Promise<void> {
  const both = await $typedFetch.try('/api/users', {
    method: 'post',
    body: { name: 'Ada', email: 'ada@example.com' },
  })

  if (both.error) {
    const variant = both.error.data!.data.__knownError__
    type _tags = Assert<
      Equal<typeof variant.tag, 'user-exists' | 'validation-failed'>
    >

    if (variant.tag === 'user-exists') {
      type _payload = Assert<Equal<typeof variant.data.email, string>>
    }
  } else {
    // Narrowed by the sibling guard alone - no second check and no `!`.
    type _data = Assert<Equal<typeof both.data, { created: string }>>
  }

  // A `validate`-only route can still only fail one way.
  const validateOnly = await $typedFetch.try('/api/search', {
    query: { page: 'nope' },
  })

  if (validateOnly.error) {
    type _onlyVariant = Assert<
      Equal<
        NonNullable<
          typeof validateOnly.error.data
        >['data']['__knownError__']['tag'],
        'validation-failed'
      >
    >
  }

  // An unbranded route carries nothing to narrow on.
  const unbranded = await $typedFetch.try('/api/legacy')

  if (unbranded.error) {
    type _untyped = Assert<Equal<typeof unbranded.error.data, unknown>>
  }
}
