/**
 * The two mechanisms side by side, per handler and per route: what Nuxt 4.6's
 * extractor reads off the `H3Event<Request>` slot, and what the generated
 * `KnownApiRequestInputs` map reads off our brand.
 */

import type { RequestBody, RequestQuery } from '#build/server-routes'
import type {
  RequestInputOfHandler,
  RequestInputOfRoute,
} from '@dphonys/better-handler/types'
import type {
  RequestBodyOf,
  RequestQueryOf,
} from '@nuxt/nitro-server/request-types'

/** The two sources both mechanisms type. */
type Source = 'body' | 'query'

/** One source of a Request input, or `never` when it declares none. */
type SourceOf<Input, Key extends Source> = [Input] extends [never]
  ? never
  : Key extends keyof Input
    ? Input[Key]
    : never

/** What Nuxt's extractor reads off one handler's slot. */
export type NativeOfHandler<Handler, Key extends Source> = Key extends 'body'
  ? RequestBodyOf<Handler>
  : RequestQueryOf<Handler>

/** What our map holds for one handler. */
export type OursOfHandler<Handler, Key extends Source> = SourceOf<
  RequestInputOfHandler<Handler>,
  Key
>

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * What Nuxt's generated route types resolve for one call, `never` where they
 * type nothing.
 */
export type NativeOfRoute<
  Path extends string,
  M extends Method,
  Key extends Source,
> = Key extends 'body'
  ? RequestBody<Path, M, never>
  : RequestQuery<Path, M, never>

/** What our map resolves for the same call. */
export type OursOfRoute<
  Path extends string,
  M extends Method,
  Key extends Source,
> = SourceOf<RequestInputOfRoute<Path, M>, Key>
