import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
} from 'h3'
import type {
  DeclareSomething,
  IsAny,
  ValidationSchemasGuard,
} from './internal'

export type {
  DeclareSomething,
  ValidationDeclarationError,
  ValidationSchemasGuard,
} from './internal'

/** The four sources, in the settled fail-fast order. Every key is optional. */
export interface ValidationSchemas {
  route?: SourceSchemas
  query?: SourceSchemas
  headers?: SourceSchemas
  body?: SourceSchemas
}

/** `'route' | 'query' | 'headers' | 'body'`. */
export type ValidationSource = keyof ValidationSchemas

/**
 * What one source slot accepts: a schema, or a non-empty tuple of schemas that
 * each parse the same raw source and whose outputs merge. A tuple, not an
 * array, because a widened `StandardSchemaV1[]` cannot say how many schemas it
 * holds and the merged output could not be typed.
 */
export type SourceSchemas =
  | StandardSchemaV1
  | readonly [StandardSchemaV1, ...StandardSchemaV1[]]

/** A schema's output (`InferOutput`), so transforms land already applied. */
export type OutputOf<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : never

/** A schema's input (`InferInput`) - what the client sends, before transforms. */
export type InputOf<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never

// One object type restated as its own keys, so a merge reads back on hover as
// the flat record the runtime hands over. An index-signature output widens
// `keyof`, and restating from that would drop every named key beside it.
type Flattened<T> = string extends keyof T
  ? T
  : number extends keyof T
    ? T
    : symbol extends keyof T
      ? T
      : { [K in keyof T]: T[K] }

// Both sides distribute first, so `{ a } | { b }` against `{ c }` stays
// `{ a; c } | { b; c }` - the runtime hands back whichever branch matched.
type Merged<Head, Rest> = Head extends unknown
  ? Rest extends unknown
    ? Flattened<Head & Rest>
    : never
  : never

/**
 * A composed tuple's delivered value: element by element rather than through
 * `UnionToIntersection`, so a schema outputting a union of objects stays a
 * union through the merge.
 */
export type MergedOutput<T> = T extends readonly [
  infer Head extends StandardSchemaV1,
  ...infer Rest,
]
  ? Rest extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? Merged<OutputOf<Head>, MergedOutput<Rest>>
    : OutputOf<Head>
  : never

/** One slot's delivered value: a lone schema's output, or the tuple's merge. */
export type SourceValue<T> = T extends readonly [
  StandardSchemaV1,
  ...StandardSchemaV1[],
]
  ? MergedOutput<T>
  : OutputOf<T>

/**
 * A composed tuple's input: the intersection of element inputs, flattened to
 * one record - every element parses the whole raw source, so the wire must
 * satisfy all of them. Outputs merge later-wins; inputs intersect.
 */
// Not distributed the way `Merged` is: a union input means "send either", and
// intersecting the union whole keeps that, where distributing would split it.
export type MergedInput<T> = T extends readonly [
  infer Head extends StandardSchemaV1,
  ...infer Rest,
]
  ? Rest extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? Flattened<InputOf<Head> & MergedInput<Rest>>
    : InputOf<Head>
  : never

/** One slot's input: a lone schema's input, or the tuple's intersection. */
export type SourceInput<T> = T extends readonly [
  StandardSchemaV1,
  ...StandardSchemaV1[],
]
  ? MergedInput<T>
  : InputOf<T>

/**
 * The handler's second parameter: exactly the sources the declaration
 * guarantees, each typed as its slot's delivered value. A key is guaranteed
 * only when its slot type cannot be `undefined`, so a declaration annotated
 * `const schemas: ValidationSchemas = { query }` guarantees nothing and
 * delivers no sources; use `satisfies ValidationSchemas` instead.
 */
export type ValidatedContext<S extends ValidationSchemas> = {
  [K in Extract<keyof S, ValidationSource> as undefined extends S[K]
    ? never
    : K]: SourceValue<S[K]>
}

/**
 * The Request input: keys = declared sources, values = what the client sends.
 * Same key rule as `ValidatedContext` - a slot typed `| undefined` declares
 * nothing and contributes no key.
 */
export type RequestInput<S extends ValidationSchemas> = {
  [K in Extract<keyof S, ValidationSource> as undefined extends S[K]
    ? never
    : K]: SourceInput<S[K]>
}

/**
 * A declared Response output. One schema, meaning a single `200` reply the
 * handler returns plainly.
 */
export type ResponseOutput = StandardSchemaV1

/**
 * The body a declaration promises: the declared schema's _output_ type, so a
 * transform is already applied by the time the value is sent. `unknown` when a
 * route declares no Response output, which constrains the return to nothing.
 */
export type ResponseBody<O> = O extends ResponseOutput ? OutputOf<O> : unknown

/**
 * What the Response-output slot carries: the status map the declaration means,
 * which for the bare form is a single `200`. `never` when nothing is declared.
 */
export type ResponseOutputs<O> = O extends ResponseOutput
  ? { 200: OutputOf<O> }
  : never

/**
 * What a route declares: its Validation sources, its Response output, or both.
 * Bare `{}` is refused by the guard the two halves intersect with.
 */
export type ValidatedHandlerOptions<
  S extends ValidationSchemas,
  O,
> = DeclareSomething<S, O> & {
  input?: S & ValidationSchemasGuard<S>
  output?: O
}

// Module-private and never exported, so only this package can brand a handler:
// a structural `__requestInput__` or `__responseOutput__` key on a foreign
// handler must not spoof the readers below. Named as a pair, because the two
// slots are the two sides of one declaration.
declare const requestInput: unique symbol
declare const responseOutput: unique symbol

/**
 * The handler `defineValidatedEventHandler` returns: an ordinary h3
 * `EventHandler` carrying the computed Request input and the declared Response
 * output in phantom slots. Neither slot is ever assigned at runtime; they
 * exist so a typed client can read what the route expects and what it sends,
 * from `RequestInputOfHandler` and `ResponseOutputOfHandler`.
 */
export interface ValidatedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Input = never,
  Output = never,
> extends EventHandler<Request, Response> {
  [requestInput]?: Input
  [responseOutput]?: Output
}

/**
 * The Request input a branded handler carries, or `never` for `any` and for
 * any handler this package did not produce. `never` rather than `{}` on
 * purpose: a reader guards `[Input] extends [never]` before keying on it.
 */
// `IsAny` first because `any` otherwise matches the slot with `I = unknown`;
// `Exclude` because an unbranded handler matches the optional slot with
// `I = undefined`, which is the same "no brand" answer and must read `never`.
export type RequestInputOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { [requestInput]?: infer I }
      ? Exclude<I, undefined>
      : never

/**
 * The Response output a branded handler carries, or `never` for `any` and for
 * any handler this package did not produce - read the same way, and guarded
 * the same way, as its Request-input sibling above.
 */
export type ResponseOutputOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { [responseOutput]?: infer O }
      ? Exclude<O, undefined>
      : never

/**
 * One projected issue - the whole of what a client is told about a rejected
 * value. Raw Standard Schema issues never reach it.
 */
export interface ValidationIssue {
  source: ValidationSource
  message: string
  path: Array<string | number>
}

/**
 * The h3 error's `data` payload on the wire, and what
 * `recognizeValidationError` hands a hook. A fetched failure sits at
 * `err.data.data.issues`.
 */
export interface ValidationErrorData {
  issues: ValidationIssue[]
}
