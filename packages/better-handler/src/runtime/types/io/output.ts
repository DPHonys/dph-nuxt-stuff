import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { IsUnion } from '../utils'
import type { InputOf } from './input'

/**
 * The map form of a Response output: one HTTP status from 100 to 399 per
 * reply the route can send, each carrying that reply's schema, or `null` for
 * a status that sends no body at all. A failure status is no reply of
 * `output`'s: a client fetch throws on it, so it is declared under `errors`.
 */
export interface StatusMap {
  readonly [status: number]: StandardSchemaV1 | null
}

/**
 * A route's `output`: one Standard Schema, for a single `200` reply the
 * Handler returns plainly, or a status map the Handler answers through the
 * Respond helper.
 */
export type ResponseOutput = StandardSchemaV1 | StatusMap

/**
 * Whether `Output` is a status map naming at least one status. An empty `{}`
 * fits the map's index signature while naming no reply, so it declares
 * nothing, as an empty `input` or `errors` does; every reader of the map form
 * goes through this, so `{}` is the same non-declaration to `respond`, to the
 * return type and to the declare-something guard. A schema is answered first:
 * an object type with no numeric key would otherwise fit the index signature.
 */
export type IsStatusMap<Output> = [Output] extends [StandardSchemaV1]
  ? false
  : [Output] extends [StatusMap]
    ? [keyof Output] extends [never]
      ? false
      : true
    : false

/**
 * A rule an `output` declaration broke. Nothing the author writes can satisfy
 * it, so the diagnostic prints at `output` with this sentence inside it.
 */
export interface OutputDeclarationError<Msg extends string> {
  readonly 'output-declaration-error': Msg
}

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

/**
 * The sentence a status-map key breaks, or `never`: it must be an integer
 * from 100 to 399, read off its decimal form, so `404` and `200.5` are
 * refused alike. Plain `number`, the key of a map annotated `StatusMap`, says
 * nothing about its value and is left to the declaration-time throw.
 * Distributes over the map's keys.
 */
type StatusKeyRule<Status> = number extends Status
  ? never
  : Status extends number | string
    ? `${Status}` extends `${1 | 2 | 3}${Digit}${Digit}`
      ? never
      : `the status must be an integer from 100 to 399, not ${Status} - a failure status is declared under errors, by tag`
    : never

/**
 * The guard a route's `output` intersects with: `unknown`, the identity of
 * `&`, for a schema and for a map whose every key is a status from 100 to
 * 399; the unsatisfiable property otherwise. Checked on the map as a whole,
 * not key by key: a key declared `null` intersected with the property would
 * be `never`, and the sentence would be lost from the diagnostic.
 */
export type OutputGuard<Output> = Output extends StandardSchemaV1
  ? unknown
  : [StatusKeyRule<keyof Output>] extends [never]
    ? unknown
    : OutputDeclarationError<StatusKeyRule<keyof Output>>

/**
 * Whether a route declares a Response output: a schema, or a status map naming
 * a status. A declaration annotated with the public `ResponseOutput` union
 * declares one as well, though it says nothing about which form.
 */
export type HasOutput<Output> = [Output] extends [ResponseOutput]
  ? [Output] extends [StatusMap]
    ? IsStatusMap<Output>
    : true
  : false

/**
 * What one status-map slot sends: its schema's input, or `null` for a status
 * declared `null`. Distributes, so the `StandardSchemaV1 | null` slot of a map
 * annotated with the public `StatusMap` keeps a body - `unknown`, as an
 * untyped schema's - rather than reading as bodiless.
 */
type SlotBody<Slot> = Slot extends StandardSchemaV1 ? InputOf<Slot> : null

/**
 * The replies a Response output declares, as a map from status to the body
 * that status sends: the bare form is a single `200`, and each body is its
 * schema's _input_ type - what the Handler hands over, what the development
 * check validates and what goes out, as nothing transforms it on the way; a
 * status declared `null` maps to `null`. `never` when the route declares no
 * Response output.
 */
export type ResponseOutputs<Output> = Output extends StandardSchemaV1
  ? { 200: InputOf<Output> }
  : IsStatusMap<Output> extends true
    ? { [Status in keyof Output]: SlotBody<Output[Status]> }
    : never

/**
 * The statuses a status map declares `null`: the bodiless replies, which take
 * no value. Told apart on the declaration, not on the body, because a schema
 * whose input is `null` sends a body of `null` too and takes it as its value.
 * `never` for the bare form and for a map annotated with `StatusMap`, whose
 * slots may each be a schema.
 */
export type BodilessStatuses<Output> =
  IsStatusMap<Output> extends true
    ? {
        [Status in keyof Output]-?: [Output[Status]] extends [null]
          ? Status
          : never
      }[keyof Output]
    : never

/** Every body a Response output can send, as one union: what a client sees. */
export type ResponseBodies<Output> =
  ResponseOutputs<Output>[keyof ResponseOutputs<Output>]

// Module-private and never exported, so nothing outside this package can
// fabricate a Respond helper's result: a Handler returning a plain value on a
// map-form route is refused because it cannot spell this key.
declare const respondedWith: unique symbol

/**
 * The Respond helper's result: one declared status paired with a value of that
 * status's shape, which the wrapper unwraps to set the status and send the
 * body. Opaque on purpose: the only way to make one is `respond`.
 */
export interface Responded<Outputs> {
  readonly [respondedWith]: Outputs
}

/**
 * A rule a call to the Respond helper broke. Nothing the author passes can
 * satisfy it, so the diagnostic prints at the status with this sentence
 * inside it.
 */
export interface RespondError<Msg extends string> {
  readonly 'respond-error': Msg
}

// The status a call names, checked: one declared status. `Status` is
// inferred from anything a status can be rather than from the declared ones,
// so an undeclared status is refused here, against the declared ones, rather
// than on an argument count the fallback to the constraint would pick. A
// union is refused whole: its value would only have to fit one of its
// statuses' bodies, and the pairing is the helper's whole promise.
type RespondStatus<Outputs, Status> = [Status] extends [keyof Outputs]
  ? IsUnion<Status> extends true
    ? RespondError<'respond takes one status literal - respond under each status in its own branch'>
    : Status
  : keyof Outputs

// The value a call takes after a valid status: none for a status declared
// `null`, its body otherwise - `null` itself for a schema whose input is
// `null`, anything for one whose input is `any`. Any arguments at all after a
// status refused above, so that status is the one diagnostic.
type RespondArgs<Outputs, Bodiless, Status> = [Status] extends [keyof Outputs]
  ? IsUnion<Status> extends true
    ? unknown[]
    : [Status] extends [Bodiless]
      ? []
      : [value: Outputs[Status]]
  : unknown[]

/**
 * The Respond helper on the Handler context of a route whose `output` is a
 * status map. It pairs one declared status with that status's body, as the
 * Fail helper pairs a tag with its fields: a status declared `null`, one of
 * `Bodiless`, takes no value and refuses one.
 *
 * ```ts
 * return respond(201, order)
 * return respond(204)
 * ```
 */
// One signature with the value on a rest tuple the status picks, rather than
// an overload per arity: a rejected call reports the one pairing it broke
// instead of an essay over every overload.
export interface Respond<Outputs, Bodiless extends PropertyKey = never> {
  <Status extends PropertyKey>(
    status: RespondStatus<Outputs, Status>,
    ...value: RespondArgs<Outputs, Bodiless, Status>
  ): Responded<Outputs>
}

/**
 * What a Handler must hand back: the schema's input for the bare form, the
 * Respond helper's result for the map form, and anything at all when the
 * route declares no Response output.
 */
export type HandlerReturn<Output> = Output extends StandardSchemaV1
  ? InputOf<Output>
  : IsStatusMap<Output> extends true
    ? Responded<ResponseOutputs<Output>>
    : unknown

/**
 * What the returned Handler answers with, once settled: the bare form's
 * input type, the union of a status map's bodies rather than the Respond
 * helper's result that carried them, and the Handler's own return when the
 * route declares no Response output.
 */
export type SentResponse<Output, Response> = Output extends StandardSchemaV1
  ? InputOf<Output>
  : IsStatusMap<Output> extends true
    ? ResponseBodies<Output>
    : Awaited<Response>
