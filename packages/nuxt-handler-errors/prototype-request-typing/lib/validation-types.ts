// Stand-in for what ticket 04 adds to `@dphonys/nuxt-handler-validation/types`:
// the input-type family and the branded `ValidatedEventHandler`.
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler, EventHandlerRequest, EventHandlerResponse } from 'h3'
import type {
  SourceSchemas,
  ValidationSchemas,
  ValidationSource,
} from '../../../nuxt-handler-validation/src/runtime/types'

export type { ValidationSchemas, ValidationSource, ValidatedContext, ValidationIssue } from '../../../nuxt-handler-validation/src/runtime/types'

export type InputOf<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never

type Flattened<T> = string extends keyof T ? T : number extends keyof T ? T : symbol extends keyof T ? T : { [K in keyof T]: T[K] }

/** Tuple inputs INTERSECT (every element parses the whole raw source). */
export type MergedInput<T> = T extends readonly [infer Head extends StandardSchemaV1, ...infer Rest]
  ? Rest extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? Flattened<InputOf<Head> & MergedInput<Rest>>
    : InputOf<Head>
  : never

export type SourceInput<T> = T extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
  ? MergedInput<T>
  : InputOf<T>

/** Keys = declared sources, values = what the client sends. */
export type RequestInput<S extends ValidationSchemas> = {
  [K in Extract<keyof S, ValidationSource> as undefined extends S[K] ? never : K]: SourceInput<S[K]>
}

export interface ValidatedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Input = never,
> extends EventHandler<Request, Response> {
  __requestInput__?: Input
}

type IsAny<T> = 0 extends 1 & T ? true : false

export type RequestInputOfHandler<T> =
  IsAny<T> extends true ? never : T extends { __requestInput__?: infer I } ? Exclude<I, undefined> : never

export type _SourceSchemas = SourceSchemas
