// PROTOTYPE (ticket 10). Shipped-form declarations (a .d.ts, as nuxt-module-builder emits),
// so skipLibCheck treats them as a consumer's compiler does. The handler type `defineBetterEventHandler` returns:
// h3's `EventHandler<Request, Response>` with `Request` = the native slot
// (schema *input* types of the declared `body` and `query`, keys present only
// for declared sources), plus the three phantom brands our emitter reads.
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import type {
  HandlerReturn,
  OutputOf,
  RequestInput,
  ResponseOutput,
  ResponseOutputs,
  SentResponse,
  ValidatedContext,
  ValidationIssue,
  ValidationSchemas,
} from '../../../packages/nuxt-handler-validation/src/runtime/types'

// ---------------------------------------------------------------------------
// The native slot
// ---------------------------------------------------------------------------

/**
 * The `H3Event<Request>` slot: the Request input restricted to `body` and
 * `query`, the only two keys h3 v1's `EventHandlerRequest` (and so Nuxt 4.6's
 * `RequestBodyOf`/`RequestQueryOf`) knows. A source the route does not
 * declare has no key, so Nuxt's extractor answers `never` for it.
 */
export type NativeRequest<S extends ValidationSchemas> = {
  [K in keyof RequestInput<S> as K extends 'body' | 'query'
    ? K
    : never]: K extends 'query'
    ? NativeQuery<RequestInput<S>[K]>
    : RequestInput<S>[K]
}

/**
 * The query restated key for key. Nuxt's `RequestOf` infers through
 * `H3Event<infer Request>`, and that `infer` inherits h3's
 * `Request extends EventHandlerRequest` constraint, so a query that is not
 * assignable to ufo's `QueryObject` (an index-signature record) makes the
 * extractor answer `never`. An interface has no implicit index signature; the
 * same keys as a mapped type do. Homomorphic, so unions, arrays and
 * primitives pass through as they are.
 */
type NativeQuery<Q> = { [K in keyof Q]: Q[K] }

// ---------------------------------------------------------------------------
// Errors (the spec's tag-keyed map, reduced to what the types need)
// ---------------------------------------------------------------------------

export interface ErrorEntry {
  readonly status: number
  readonly schema?: StandardSchemaV1
}

export interface ErrorsDeclaration {
  readonly [tag: string]: ErrorEntry
}

type FieldsOf<Entry> = Entry extends {
  schema: infer S extends StandardSchemaV1
}
  ? Omit<OutputOf<S>, '_tag'>
  : // eslint-disable-next-line ts/no-empty-object-type
    {}

type Flat<T> = { [K in keyof T]: T[K] }

/** One declared variant per tag: `{ _tag, ...fields }`. */
export type TaggedErrorOf<E> = {
  [K in keyof E & string]: Flat<{ _tag: K } & FieldsOf<E[K]>>
}[keyof E & string]

/** The built-in variant every route with `input` carries. */
export interface ValidationFailed {
  _tag: 'validation-failed'
  issues: ValidationIssue[]
}

type HasInput<S> = [keyof S] extends [never] ? false : true

export type KnownErrorsOf<E, S> =
  | TaggedErrorOf<E>
  | (HasInput<S> extends true ? ValidationFailed : never)

/** The Fail helper: tag and fields paired at compile time. */
export interface Fail<E> {
  <Tag extends keyof E & string>(
    tag: Tag,
    ...fields: keyof FieldsOf<E[Tag]> extends never
      ? []
      : [fields: FieldsOf<E[Tag]>]
  ): Error & { _tag: Tag }
}

type HasErrors<E> = [keyof E] extends [never] ? false : true

export type HandlerContext<
  S extends ValidationSchemas,
  O,
  E,
> = ValidatedContext<S, O> &
  (HasErrors<E> extends true
    ? { fail: Fail<E> }
    : // eslint-disable-next-line ts/no-empty-object-type
      {})

// ---------------------------------------------------------------------------
// The returned handler
// ---------------------------------------------------------------------------

// Module-private, so only this file can brand a handler.
declare const requestInput: unique symbol
declare const responseOutput: unique symbol
declare const knownErrors: unique symbol

/**
 * What `defineBetterEventHandler` returns: an ordinary h3 `EventHandler`
 * whose `Request` generic is the native slot, carrying our three phantom
 * brands beside it. Nothing here is assigned at runtime.
 */
export interface BetterEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Input = never,
  Output = never,
  Errors = never,
> extends EventHandler<Request, Response> {
  [requestInput]?: Input
  [responseOutput]?: Output
  [knownErrors]?: Errors
}

type IsAny<T> = 0 extends 1 & T ? true : false

export type RequestInputOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { [requestInput]?: infer I }
      ? Exclude<I, undefined>
      : never

export type ResponseOutputOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { [responseOutput]?: infer O }
      ? Exclude<O, undefined>
      : never

export type KnownErrorsOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { [knownErrors]?: infer E }
      ? Exclude<E, undefined>
      : never

export interface BetterHandlerOptions<S, O, E> {
  input?: S
  output?: O
  errors?: E
}

export declare function defineBetterEventHandler<
  // eslint-disable-next-line ts/no-empty-object-type
  const S extends ValidationSchemas = {},
  O extends ResponseOutput | undefined = undefined,
  // eslint-disable-next-line ts/no-empty-object-type
  const E extends ErrorsDeclaration = {},
  Response extends EventHandlerResponse<HandlerReturn<O>> =
    EventHandlerResponse<HandlerReturn<O>>,
>(
  options: BetterHandlerOptions<S, O, E>,
  handler: (event: H3Event, ctx: HandlerContext<S, O, E>) => Response
): BetterEventHandler<
  NativeRequest<S>,
  SentResponse<O, Response>,
  RequestInput<S>,
  ResponseOutputs<O>,
  KnownErrorsOf<E, S>
>
