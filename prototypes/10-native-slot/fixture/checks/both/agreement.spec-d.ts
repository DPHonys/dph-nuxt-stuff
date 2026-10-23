// PROTOTYPE (ticket 10), question 2: the two-mechanism agreement.
//
// For every fixture route, the native slot (what Nuxt 4.6's extractor reads,
// per handler and per route through `#build/server-routes`) and our map
// (`KnownApiRequestInputs`) agree on `body` and `query`, except where a row
// says EXCEPTION. Compiled in both the flag-on and the flag-off program: the
// generated route set is written either way.
import { describe, expectTypeOf, it } from 'vitest'
import type {
  NativeOfHandler as NH,
  NativeOfRoute as NR,
  OursOfHandler as OH,
  OursOfRoute as OR,
} from '../helpers'

type UsersPost = typeof import('../../server/api/users.post').default
type UsersGet = typeof import('../../server/api/users.get').default
type ItemsId = typeof import('../../server/api/items/[id]').default
type OrdersPut = typeof import('../../server/api/orders.put').default
type TagsPost = typeof import('../../server/api/tags.post').default
type CountPost = typeof import('../../server/api/count.post').default
type TextPost = typeof import('../../server/api/text.post').default
type ReportGet = typeof import('../../server/api/report.get').default
type ThingDelete = typeof import('../../server/api/thing.delete').default
type PlainGet = typeof import('../../server/api/plain.get').default
type NativePost = typeof import('../../server/api/native.post').default
type SearchGet = typeof import('../../server/api/search.get').default
type SignupPost = typeof import('../../server/api/signup.post').default
type ProfilePatch = typeof import('../../server/api/profile.patch').default
type OptionalBody = typeof import('../../server/api/optional-body.post').default
type UnionBody = typeof import('../../server/api/union-body.post').default
type MixedUnion = typeof import('../../server/api/mixed-union.post').default
type UnknownBody = typeof import('../../server/api/unknown-body.post').default
type RecordBody = typeof import('../../server/api/record-body.post').default
type HeadersOnly = typeof import('../../server/api/headers-only.get').default
type RouteOnly = typeof import('../../server/api/route-only/[slug].get').default
type Everything = typeof import('../../server/api/everything/[id].post').default
type InterfaceQuery =
  typeof import('../../server/api/interface-query.get').default
type QueryArray = typeof import('../../server/api/query-array.get').default
type Nested = typeof import('../../server/api/nested.post').default
type MultiOne = typeof import('../../server/api/multi.post').default
type MultiTwo = typeof import('../../server/extra/multi-two').default

// A broken `import()` in a .d.ts is `any`, and `any` reads `never` through
// both readers - every "both never" row would pass vacuously. Refuse it first.
describe('every fixture handler resolves', () => {
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
    expectTypeOf<Nested>().not.toBeAny()
    expectTypeOf<MultiOne>().not.toBeAny()
    expectTypeOf<MultiTwo>().not.toBeAny()
  })
})

describe('per handler: RequestBodyOf/RequestQueryOf against KnownApiRequestInputs', () => {
  it('object body with a transform, tuple query (input types)', () => {
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
  it('all-optional query; undeclared body is never on both', () => {
    expectTypeOf<NH<UsersGet, 'query'>>().toEqualTypeOf<OH<UsersGet, 'query'>>()
    expectTypeOf<NH<UsersGet, 'body'>>().toBeNever()
    expectTypeOf<OH<UsersGet, 'body'>>().toBeNever()
  })
  it('default handler: route + body', () => {
    expectTypeOf<NH<ItemsId, 'body'>>().toEqualTypeOf<OH<ItemsId, 'body'>>()
    expectTypeOf<NH<ItemsId, 'body'>>().toEqualTypeOf<{ qty: number }>()
    expectTypeOf<NH<ItemsId, 'query'>>().toBeNever()
    expectTypeOf<OH<ItemsId, 'query'>>().toBeNever()
  })
  it('tuple-composed body', () => {
    expectTypeOf<NH<OrdersPut, 'body'>>().toEqualTypeOf<OH<OrdersPut, 'body'>>()
    expectTypeOf<NH<OrdersPut, 'body'>>().toEqualTypeOf<{
      sku: string
      qty: number
      note?: string
    }>()
  })
  it('EXCEPTION array body: never natively, typed by our map', () => {
    expectTypeOf<NH<TagsPost, 'body'>>().toBeNever()
    expectTypeOf<OH<TagsPost, 'body'>>().toEqualTypeOf<string[]>()
  })
  it('EXCEPTION primitive bodies: never natively, typed by our map', () => {
    expectTypeOf<NH<CountPost, 'body'>>().toBeNever()
    expectTypeOf<OH<CountPost, 'body'>>().toEqualTypeOf<number>()
    expectTypeOf<NH<TextPost, 'body'>>().toBeNever()
    expectTypeOf<OH<TextPost, 'body'>>().toEqualTypeOf<string>()
  })
  it('output-only, errors-only, undeclared, headers-only, route-only: never on both', () => {
    for (const _ of [0]) {
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
    }
  })
  it('EXCEPTION foreign handler filling the slot itself: Nuxt types it, our map is vanilla', () => {
    expectTypeOf<NH<NativePost, 'body'>>().toEqualTypeOf<{ x: number }>()
    expectTypeOf<OH<NativePost, 'body'>>().toBeNever()
  })
  it('EXCEPTION zod coerce query: an `unknown` value is not a QueryValue, so Nuxt answers never', () => {
    expectTypeOf<NH<SearchGet, 'query'>>().toBeNever()
    // Our map's `Simplify` turns the `unknown` input into `{}`.
    expectTypeOf<OH<SearchGet, 'query'>>().toEqualTypeOf<{
      q: string
      page?: {} | undefined
    }>()
  })
  it('zod object body with a transform (input types)', () => {
    expectTypeOf<NH<SignupPost, 'body'>>().toEqualTypeOf<
      OH<SignupPost, 'body'>
    >()
    expectTypeOf<NH<SignupPost, 'body'>>().toEqualTypeOf<{
      email: string
      age: string
    }>()
  })
  it('all-optional body, union of records, index-signature record, nested', () => {
    expectTypeOf<NH<ProfilePatch, 'body'>>().toEqualTypeOf<
      OH<ProfilePatch, 'body'>
    >()
    expectTypeOf<NH<UnionBody, 'body'>>().toEqualTypeOf<OH<UnionBody, 'body'>>()
    expectTypeOf<NH<RecordBody, 'body'>>().toEqualTypeOf<
      OH<RecordBody, 'body'>
    >()
    expectTypeOf<NH<Nested, 'body'>>().toEqualTypeOf<OH<Nested, 'body'>>()
  })
  it('EXCEPTION body input admitting undefined: Nuxt strips it (NonNullable)', () => {
    expectTypeOf<NH<OptionalBody, 'body'>>().toEqualTypeOf<{ a: string }>()
    expectTypeOf<OH<OptionalBody, 'body'>>().toEqualTypeOf<
      { a: string } | undefined
    >()
  })
  it('EXCEPTION record | array: Nuxt keeps the record branch only', () => {
    expectTypeOf<NH<MixedUnion, 'body'>>().toEqualTypeOf<{ a: string }>()
    expectTypeOf<OH<MixedUnion, 'body'>>().toEqualTypeOf<
      { a: string } | string[]
    >()
  })
  it('unknown body: `{}` on both, by accident (Nuxt: `NonNullable<unknown>`; ours: `Simplify<unknown>`)', () => {
    expectTypeOf<NH<UnknownBody, 'body'>>().toEqualTypeOf<
      OH<UnknownBody, 'body'>
    >()
    // eslint-disable-next-line ts/no-empty-object-type
    expectTypeOf<NH<UnknownBody, 'body'>>().toEqualTypeOf<{}>()
  })
  it('every source declared', () => {
    expectTypeOf<NH<Everything, 'body'>>().toEqualTypeOf<
      OH<Everything, 'body'>
    >()
    expectTypeOf<NH<Everything, 'query'>>().toEqualTypeOf<
      OH<Everything, 'query'>
    >()
  })
  it('interface-typed query reaches Nuxt once the slot restates it (NativeQuery)', () => {
    expectTypeOf<NH<InterfaceQuery, 'query'>>().toEqualTypeOf<
      OH<InterfaceQuery, 'query'>
    >()
    expectTypeOf<NH<InterfaceQuery, 'query'>>().toEqualTypeOf<{
      status: 'open' | 'closed'
    }>()
  })
  it('EXCEPTION array query: never natively', () => {
    expectTypeOf<NH<QueryArray, 'query'>>().toBeNever()
    expectTypeOf<OH<QueryArray, 'query'>>().toEqualTypeOf<string[]>()
  })
  it('each of two handlers on one (route, method) agrees on its own', () => {
    expectTypeOf<NH<MultiOne, 'body'>>().toEqualTypeOf<OH<MultiOne, 'body'>>()
    expectTypeOf<NH<MultiTwo, 'body'>>().toEqualTypeOf<OH<MultiTwo, 'body'>>()
  })
})

describe('per route: #build/server-routes against RequestInputOfRoute', () => {
  it('agreeing routes', () => {
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
    expectTypeOf<NR<'/api/unknown-body', 'POST', 'body'>>().toEqualTypeOf<
      OR<'/api/unknown-body', 'POST', 'body'>
    >()
  })
  it('never on both', () => {
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
  it('EXCEPTIONS carried to the route level', () => {
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
    expectTypeOf<NR<'/api/search', 'GET', 'query'>>().toBeNever()
    expectTypeOf<OR<'/api/search', 'GET', 'query'>>().toEqualTypeOf<{
      q: string
      page?: {} | undefined
    }>()
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
  it('EXCEPTION two handlers on one (route, method): Nuxt emits no request types, our map unions', () => {
    expectTypeOf<NR<'/api/multi', 'POST', 'body'>>().toBeNever()
    expectTypeOf<OR<'/api/multi', 'POST', 'body'>>().toEqualTypeOf<
      { one: string } | { two: number }
    >()
  })
})
