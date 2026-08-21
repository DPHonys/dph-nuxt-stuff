import type { KnownApiRequestInputs, RequestInputOfRoute, TypedRequestOptions } from '../lib/typed-fetch'
import type { RequestInputOfHandler, RequestInput } from '../lib/validation-types'
import type { KnownErrorsOfHandler } from '../../src/runtime/types'
import type { MatchedRoutes } from 'nitropack/types'
type H = typeof import('../routes/users.post').default
export type P1 = H['__requestInput__']
export type P2 = RequestInputOfHandler<H>
export type P3 = KnownApiRequestInputs['/api/users']
export type P4 = RequestInputOfRoute<'/api/users', 'post'>
export type P5 = TypedRequestOptions<'/api/users', 'post'>['body']
export type P6 = MatchedRoutes<'/api/users'>
export type P7 = KnownErrorsOfHandler<H>
export type P8 = H['__knownErrors__']
