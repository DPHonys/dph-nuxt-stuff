import type { RequestBody, RequestQuery } from '#build/server-routes'
// PROTOTYPE (ticket 10). The two readers side by side, per handler and per route.
import type {
  RequestBodyOf,
  RequestQueryOf,
} from '@nuxt/nitro-server/request-types'
import type { WireInput } from '../../lib/engine'
import type { RequestInputOfHandler } from '../../lib/handler'
import type { RequestInputOfRoute } from '../../lib/request-typing'

type Source = 'body' | 'query'

type Field<I, K extends Source> = [I] extends [never]
  ? never
  : K extends keyof I
    ? I[K]
    : never

/** What Nuxt 4.6's extractor reads off one handler's `H3Event<Request>` slot. */
export type NativeOfHandler<H, K extends Source> = K extends 'body'
  ? RequestBodyOf<H>
  : RequestQueryOf<H>

/** What our emitter writes into `KnownApiRequestInputs` for one handler. */
export type OursOfHandler<H, K extends Source> = Field<
  WireInput<RequestInputOfHandler<H>>,
  K
>

type Upper = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** What the generated engine (`#build/server-routes`) resolves for a call. */
export type NativeOfRoute<
  P extends string,
  M extends Upper,
  K extends Source,
> = K extends 'body' ? RequestBody<P, M, never> : RequestQuery<P, M, never>

/** What our map resolves for the same call. */
export type OursOfRoute<
  P extends string,
  M extends Upper,
  K extends Source,
> = Field<RequestInputOfRoute<P, Lowercase<M>>, K>
