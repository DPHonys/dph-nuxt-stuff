/**
 * The two-mechanism agreement: for every route of this app, what Nuxt 4.6's
 * extractor reads off the `H3Event<Request>` slot and what the generated
 * `KnownApiRequestInputs` map holds agree on `body` and `query`, per handler
 * and per route, wherever both can be exact. Where they cannot, the row pins
 * the difference, and our map is the more accurate side of every one.
 *
 * Compiled by `test/e2e/native-engine.test.ts` in this app's program, under
 * both route engines, on Nuxt 4.6 and later: Nuxt's extractor does not exist
 * before 4.6. It is an `expectTypeOf` suite like any `*.spec-d.ts`, and fails
 * as one, with a compiler error at the row that broke.
 */

import type { EventHandlerRequest } from 'h3'
import { describe, expectTypeOf, it } from 'vitest'
import type {
  NativeOfHandler as NH,
  NativeOfRoute as NR,
  OursOfHandler as OH,
  OursOfRoute as OR,
} from './helpers'

/** What one query key can carry on the native path: ufo's query values. */
type QueryCarriable = NonNullable<EventHandlerRequest['query']>[string]

type UsersPost = typeof import('../server/api/users.post').default
type UsersGet = typeof import('../server/api/users.get').default
type ItemsId = typeof import('../server/api/items/[id]').default
type OrdersPut = typeof import('../server/api/orders.put').default
type TagsPost = typeof import('../server/api/tags.post').default
type CountPost = typeof import('../server/api/count.post').default
type TextPost = typeof import('../server/api/text.post').default
type ReportGet = typeof import('../server/api/report.get').default
type ThingDelete = typeof import('../server/api/thing.delete').default
type PlainGet = typeof import('../server/api/plain.get').default
type NativePost = typeof import('../server/api/native.post').default
type SearchGet = typeof import('../server/api/search.get').default
type SignupPost = typeof import('../server/api/signup.post').default
type ProfilePatch = typeof import('../server/api/profile.patch').default
type OptionalBody = typeof import('../server/api/optional-body.post').default
type UnionBody = typeof import('../server/api/union-body.post').default
type MixedUnion = typeof import('../server/api/mixed-union.post').default
type UnknownBody = typeof import('../server/api/unknown-body.post').default
type RecordBody = typeof import('../server/api/record-body.post').default
type HeadersOnly = typeof import('../server/api/headers-only.get').default
type RouteOnly = typeof import('../server/api/route-only/[slug].get').default
type Everything = typeof import('../server/api/everything/[id].post').default
type InterfaceQuery = typeof import('../server/api/interface-query.get').default
type QueryArray = typeof import('../server/api/query-array.get').default
type QueryArrayBody =
  typeof import('../server/api/query-array-body.post').default
type Nested = typeof import('../server/api/nested.post').default
type MultiOne = typeof import('../server/api/multi.post').default
type MultiTwo = typeof import('../server/extra/multi-two').default

// An `import()` that resolves to nothing is `any`, which both readers answer
// with `never`: every "never on both" row below would pass for nothing.
describe('every handler of the app resolves', () => {
  it('is not any', () => {
    expectTypeOf<UsersPost>().not.toBeAny()
    expectTypeOf<UsersGet>().not.toBeAny()
    expectTypeOf<ItemsId>().not.toBeAny()
    expectTypeOf<OrdersPut>().not.toBeAny()
    expectTypeOf<TagsPost>().not.toBeAny()
    expectTypeOf<CountPost>().not.toBeAny()
    expectTypeOf<TextPost>().not.toBeAny()
    expectTypeOf<ReportGet>().not.toBeAny()
    expectTypeOf<ThingDelete>().not.toBeAny()
    expectTypeOf<PlainGet>().not.toBeAny()
    expectTypeOf<NativePost>().not.toBeAny()
    expectTypeOf<SearchGet>().not.toBeAny()
    expectTypeOf<SignupPost>().not.toBeAny()
    expectTypeOf<ProfilePatch>().not.toBeAny()
    expectTypeOf<OptionalBody>().not.toBeAny()
    expectTypeOf<UnionBody>().not.toBeAny()
    expectTypeOf<MixedUnion>().not.toBeAny()
    expectTypeOf<UnknownBody>().not.toBeAny()
    expectTypeOf<RecordBody>().not.toBeAny()
    expectTypeOf<HeadersOnly>().not.toBeAny()
    expectTypeOf<RouteOnly>().not.toBeAny()
    expectTypeOf<Everything>().not.toBeAny()
    expectTypeOf<InterfaceQuery>().not.toBeAny()
    expectTypeOf<QueryArray>().not.toBeAny()
    expectTypeOf<QueryArrayBody>().not.toBeAny()
    expectTypeOf<Nested>().not.toBeAny()
    expectTypeOf<MultiOne>().not.toBeAny()
    expectTypeOf<MultiTwo>().not.toBeAny()
  })
})

describe('per handler: the slot through Nuxt against our map', () => {
  it('agrees on an object body before its transform, and a tuple query', () => {
    expectTypeOf<NH<UsersPost, 'body'>>().toEqualTypeOf<OH<UsersPost, 'body'>>()
    expectTypeOf<NH<UsersPost, 'body'>>().toEqualTypeOf<{
      name: string
      age: string
    }>()
    expectTypeOf<NH<UsersPost, 'query'>>().toEqualTypeOf<
      OH<UsersPost, 'query'>
    >()
    expectTypeOf<NH<UsersPost, 'query'>>().toEqualTypeOf<{
      team: string
      page?: number
    }>()
  })

  it('agrees on an all-optional query, and on never for the body it lacks', () => {
    expectTypeOf<NH<UsersGet, 'query'>>().toEqualTypeOf<OH<UsersGet, 'query'>>()
    expectTypeOf<NH<UsersGet, 'body'>>().toBeNever()
    expectTypeOf<OH<UsersGet, 'body'>>().toBeNever()
  })

  it('agrees on a method-less handler’s body', () => {
    expectTypeOf<NH<ItemsId, 'body'>>().toEqualTypeOf<OH<ItemsId, 'body'>>()
    expectTypeOf<NH<ItemsId, 'body'>>().toEqualTypeOf<{ qty: number }>()
    expectTypeOf<NH<ItemsId, 'query'>>().toBeNever()
    expectTypeOf<OH<ItemsId, 'query'>>().toBeNever()
  })

  it('agrees on a tuple-composed body', () => {
    expectTypeOf<NH<OrdersPut, 'body'>>().toEqualTypeOf<OH<OrdersPut, 'body'>>()
    expectTypeOf<NH<OrdersPut, 'body'>>().toEqualTypeOf<{
      sku: string
      qty: number
      note?: string
    }>()
  })

  it('agrees on zod, an all-optional body, a union of records, an index signature, nesting', () => {
    expectTypeOf<NH<SignupPost, 'body'>>().toEqualTypeOf<
      OH<SignupPost, 'body'>
    >()
    expectTypeOf<NH<SignupPost, 'body'>>().toEqualTypeOf<{
      email: string
      age: string
    }>()
    expectTypeOf<NH<ProfilePatch, 'body'>>().toEqualTypeOf<
      OH<ProfilePatch, 'body'>
    >()
    expectTypeOf<NH<UnionBody, 'body'>>().toEqualTypeOf<OH<UnionBody, 'body'>>()
    expectTypeOf<NH<RecordBody, 'body'>>().toEqualTypeOf<
      OH<RecordBody, 'body'>
    >()
    expectTypeOf<NH<Nested, 'body'>>().toEqualTypeOf<OH<Nested, 'body'>>()
  })

  it('agrees on every source of a route declaring all of them', () => {
    expectTypeOf<NH<Everything, 'body'>>().toEqualTypeOf<
      OH<Everything, 'body'>
    >()
    expectTypeOf<NH<Everything, 'query'>>().toEqualTypeOf<
      OH<Everything, 'query'>
    >()
  })

  it('agrees on an interface-typed query, which the slot restates', () => {
    expectTypeOf<NH<InterfaceQuery, 'query'>>().toEqualTypeOf<
      OH<InterfaceQuery, 'query'>
    >()
    expectTypeOf<NH<InterfaceQuery, 'query'>>().toEqualTypeOf<{
      status: 'open' | 'closed'
    }>()
  })

  it('agrees on never for every route declaring neither body nor query', () => {
    expectTypeOf<NH<ReportGet, 'body'>>().toBeNever()
    expectTypeOf<OH<ReportGet, 'body'>>().toBeNever()
    expectTypeOf<NH<ReportGet, 'query'>>().toBeNever()
    expectTypeOf<OH<ReportGet, 'query'>>().toBeNever()
    expectTypeOf<NH<ThingDelete, 'body'>>().toBeNever()
    expectTypeOf<OH<ThingDelete, 'body'>>().toBeNever()
    expectTypeOf<NH<ThingDelete, 'query'>>().toBeNever()
    expectTypeOf<OH<ThingDelete, 'query'>>().toBeNever()
    expectTypeOf<NH<PlainGet, 'body'>>().toBeNever()
    expectTypeOf<OH<PlainGet, 'body'>>().toBeNever()
    expectTypeOf<NH<PlainGet, 'query'>>().toBeNever()
    expectTypeOf<OH<PlainGet, 'query'>>().toBeNever()
    expectTypeOf<NH<HeadersOnly, 'body'>>().toBeNever()
    expectTypeOf<OH<HeadersOnly, 'body'>>().toBeNever()
    expectTypeOf<NH<HeadersOnly, 'query'>>().toBeNever()
    expectTypeOf<OH<HeadersOnly, 'query'>>().toBeNever()
    expectTypeOf<NH<RouteOnly, 'body'>>().toBeNever()
    expectTypeOf<OH<RouteOnly, 'body'>>().toBeNever()
    expectTypeOf<NH<RouteOnly, 'query'>>().toBeNever()
    expectTypeOf<OH<RouteOnly, 'query'>>().toBeNever()
  })

  it('agrees on each of two handlers on one route and method, taken alone', () => {
    expectTypeOf<NH<MultiOne, 'body'>>().toEqualTypeOf<OH<MultiOne, 'body'>>()
    expectTypeOf<NH<MultiTwo, 'body'>>().toEqualTypeOf<OH<MultiTwo, 'body'>>()
  })

  it('agrees on a body declared beside a query that is no record', () => {
    expectTypeOf<NH<QueryArrayBody, 'body'>>().toEqualTypeOf<
      OH<QueryArrayBody, 'body'>
    >()
    expectTypeOf<NH<QueryArrayBody, 'body'>>().toEqualTypeOf<{
      title: string
    }>()
  })

  it('types a coerce query on both, the native one widening what no query value is', () => {
    // User story 17: typed on the native path, its keys and its query-value
    // keys exact. Only a value no query can carry - zod's coerce input,
    // `unknown` - is carried as any query value there; our map keeps it.
    expectTypeOf<NH<SearchGet, 'query'>>().toEqualTypeOf<{
      q: string
      page?: QueryCarriable
    }>()
    expectTypeOf<OH<SearchGet, 'query'>>().toEqualTypeOf<{
      q: string
      page?: unknown
    }>()
    expectTypeOf<keyof NH<SearchGet, 'query'>>().toEqualTypeOf<
      keyof OH<SearchGet, 'query'>
    >()
  })
})

describe('per handler: the known differences, our map the more accurate', () => {
  it('array and primitive bodies: never natively, typed by our map', () => {
    expectTypeOf<NH<TagsPost, 'body'>>().toBeNever()
    expectTypeOf<OH<TagsPost, 'body'>>().toEqualTypeOf<string[]>()
    expectTypeOf<NH<CountPost, 'body'>>().toBeNever()
    expectTypeOf<OH<CountPost, 'body'>>().toEqualTypeOf<number>()
    expectTypeOf<NH<TextPost, 'body'>>().toBeNever()
    expectTypeOf<OH<TextPost, 'body'>>().toEqualTypeOf<string>()
  })

  it('an array query: never natively, typed by our map', () => {
    expectTypeOf<NH<QueryArray, 'query'>>().toBeNever()
    expectTypeOf<OH<QueryArray, 'query'>>().toEqualTypeOf<string[]>()
    expectTypeOf<NH<QueryArrayBody, 'query'>>().toBeNever()
    expectTypeOf<OH<QueryArrayBody, 'query'>>().toEqualTypeOf<string[]>()
  })

  it('a body admitting undefined: Nuxt strips it, our map keeps it', () => {
    expectTypeOf<NH<OptionalBody, 'body'>>().toEqualTypeOf<{ a: string }>()
    expectTypeOf<OH<OptionalBody, 'body'>>().toEqualTypeOf<
      { a: string } | undefined
    >()
    // `unknown` admits `undefined` too: Nuxt's `NonNullable` leaves `{}`.
    // eslint-disable-next-line ts/no-empty-object-type -- what Nuxt reads
    expectTypeOf<NH<UnknownBody, 'body'>>().toEqualTypeOf<{}>()
    expectTypeOf<OH<UnknownBody, 'body'>>().toBeUnknown()
  })

  it('a body union of records and non-records: Nuxt keeps the records only', () => {
    expectTypeOf<NH<MixedUnion, 'body'>>().toEqualTypeOf<{ a: string }>()
    expectTypeOf<OH<MixedUnion, 'body'>>().toEqualTypeOf<
      { a: string } | string[]
    >()
  })

  it('a foreign handler filling the slot itself: Nuxt types it, our map has no brand to read', () => {
    expectTypeOf<NH<NativePost, 'body'>>().toEqualTypeOf<{ x: number }>()
    expectTypeOf<OH<NativePost, 'body'>>().toBeNever()
  })
})

describe('per route: Nuxt’s generated route types against our lookup', () => {
  it('agrees on every route both can type exactly', () => {
    expectTypeOf<NR<'/api/users', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/users', 'POST', 'body'>
    >()
    expectTypeOf<NR<'/api/users', 'POST', 'query'>>().toEqualTypeOf<
      OR<'/api/users', 'POST', 'query'>
    >()
    expectTypeOf<NR<'/api/users', 'GET', 'query'>>().toEqualTypeOf<
      OR<'/api/users', 'GET', 'query'>
    >()
    expectTypeOf<NR<'/api/items/42', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/items/42', 'POST', 'body'>
    >()
    expectTypeOf<NR<'/api/items/42', 'PUT', 'body'>>().toEqualTypeOf<
      OR<'/api/items/42', 'PUT', 'body'>
    >()
    expectTypeOf<NR<'/api/orders', 'PUT', 'body'>>().toEqualTypeOf<
      OR<'/api/orders', 'PUT', 'body'>
    >()
    expectTypeOf<NR<'/api/signup', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/signup', 'POST', 'body'>
    >()
    expectTypeOf<NR<'/api/profile', 'PATCH', 'body'>>().toEqualTypeOf<
      OR<'/api/profile', 'PATCH', 'body'>
    >()
    expectTypeOf<NR<'/api/union-body', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/union-body', 'POST', 'body'>
    >()
    expectTypeOf<NR<'/api/record-body', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/record-body', 'POST', 'body'>
    >()
    expectTypeOf<NR<'/api/nested', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/nested', 'POST', 'body'>
    >()
    expectTypeOf<NR<'/api/everything/9', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/everything/9', 'POST', 'body'>
    >()
    expectTypeOf<NR<'/api/everything/9', 'POST', 'query'>>().toEqualTypeOf<
      OR<'/api/everything/9', 'POST', 'query'>
    >()
    expectTypeOf<NR<'/api/interface-query', 'GET', 'query'>>().toEqualTypeOf<
      OR<'/api/interface-query', 'GET', 'query'>
    >()
    expectTypeOf<NR<'/api/query-array-body', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/query-array-body', 'POST', 'body'>
    >()
  })

  it('agrees on never wherever neither types anything', () => {
    expectTypeOf<NR<'/api/report', 'GET', 'body'>>().toBeNever()
    expectTypeOf<OR<'/api/report', 'GET', 'body'>>().toBeNever()
    expectTypeOf<NR<'/api/thing', 'DELETE', 'body'>>().toBeNever()
    expectTypeOf<OR<'/api/thing', 'DELETE', 'body'>>().toBeNever()
    expectTypeOf<NR<'/api/plain', 'GET', 'query'>>().toBeNever()
    expectTypeOf<OR<'/api/plain', 'GET', 'query'>>().toBeNever()
    expectTypeOf<NR<'/api/headers-only', 'GET', 'query'>>().toBeNever()
    expectTypeOf<OR<'/api/headers-only', 'GET', 'query'>>().toBeNever()
    expectTypeOf<NR<'/api/route-only/x', 'GET', 'query'>>().toBeNever()
    expectTypeOf<OR<'/api/route-only/x', 'GET', 'query'>>().toBeNever()
  })

  it('types the coerce query on both', () => {
    expectTypeOf<NR<'/api/search', 'GET', 'query'>>().toEqualTypeOf<{
      q: string
      page?: QueryCarriable
    }>()
    expectTypeOf<OR<'/api/search', 'GET', 'query'>>().toEqualTypeOf<{
      q: string
      page?: unknown
    }>()
  })

  it('carries every per-handler difference to the route', () => {
    expectTypeOf<NR<'/api/tags', 'POST', 'body'>>().toBeNever()
    expectTypeOf<OR<'/api/tags', 'POST', 'body'>>().toEqualTypeOf<string[]>()
    expectTypeOf<NR<'/api/count', 'POST', 'body'>>().toBeNever()
    expectTypeOf<OR<'/api/count', 'POST', 'body'>>().toEqualTypeOf<number>()
    expectTypeOf<NR<'/api/text', 'POST', 'body'>>().toBeNever()
    expectTypeOf<OR<'/api/text', 'POST', 'body'>>().toEqualTypeOf<string>()
    expectTypeOf<NR<'/api/query-array', 'GET', 'query'>>().toBeNever()
    expectTypeOf<OR<'/api/query-array', 'GET', 'query'>>().toEqualTypeOf<
      string[]
    >()
    expectTypeOf<NR<'/api/optional-body', 'POST', 'body'>>().toEqualTypeOf<{
      a: string
    }>()
    expectTypeOf<OR<'/api/optional-body', 'POST', 'body'>>().toEqualTypeOf<
      { a: string } | undefined
    >()
    expectTypeOf<NR<'/api/mixed-union', 'POST', 'body'>>().toEqualTypeOf<{
      a: string
    }>()
    expectTypeOf<OR<'/api/mixed-union', 'POST', 'body'>>().toEqualTypeOf<
      { a: string } | string[]
    >()
    expectTypeOf<NR<'/api/native', 'POST', 'body'>>().toEqualTypeOf<{
      x: number
    }>()
    expectTypeOf<OR<'/api/native', 'POST', 'body'>>().toBeNever()
  })

  it('two handlers on one route and method: Nuxt types neither, our map unions both', () => {
    expectTypeOf<NR<'/api/multi', 'POST', 'body'>>().toBeNever()
    expectTypeOf<OR<'/api/multi', 'POST', 'body'>>().toEqualTypeOf<
      { one: string } | { two: number }
    >()
  })
})
