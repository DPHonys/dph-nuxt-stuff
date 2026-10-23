// PROTOTYPE (ticket 10), question 3: our response typing (Nitro's InternalApi
// through lib/engine) against the generated engine's (`Serialize` from
// `nuxt/app` over `#build/server-routes`), per fixture route.
import type { Response } from '#build/server-routes'
import { describe, expectTypeOf, it } from 'vitest'
import type { ResponseFor } from '../../../lib/request-typing'

describe('response types agree across the engines', () => {
  it('plain, bare-output, map-output, default-method, multi-handler routes', () => {
    expectTypeOf<ResponseFor<'/api/users', unknown, 'post'>>().toEqualTypeOf<
      Response<'/api/users', 'POST'>
    >()
    expectTypeOf<ResponseFor<'/api/users', unknown, 'get'>>().toEqualTypeOf<
      Response<'/api/users', 'GET'>
    >()
    expectTypeOf<
      ResponseFor<'/api/everything/1', unknown, 'post'>
    >().toEqualTypeOf<Response<'/api/everything/1', 'POST'>>()
    expectTypeOf<ResponseFor<'/api/items/1', unknown, 'patch'>>().toEqualTypeOf<
      Response<'/api/items/1', 'PATCH'>
    >()
    expectTypeOf<ResponseFor<'/api/plain', unknown, 'get'>>().toEqualTypeOf<
      Response<'/api/plain', 'GET'>
    >()
    expectTypeOf<ResponseFor<'/api/multi', unknown, 'post'>>().toEqualTypeOf<
      Response<'/api/multi', 'POST'>
    >()
    expectTypeOf<ResponseFor<'/api/report', unknown, 'get'>>().toEqualTypeOf<
      Response<'/api/report', 'GET'>
    >()
  })
  it('DIFFERENCE a handler that only throws: Nitro falls back to unknown, the generated engine keeps never', () => {
    expectTypeOf<ResponseFor<'/api/thing', unknown, 'delete'>>().toBeUnknown()
    expectTypeOf<Response<'/api/thing', 'DELETE'>>().toBeNever()
  })
})
