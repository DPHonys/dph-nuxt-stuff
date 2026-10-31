import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ArgsFor } from '../utils'
import type { InputOf } from './input'

/**
 * The map form of a Response output: one HTTP status per reply the route can
 * send, each carrying that reply's schema, or `null` for a status that sends
 * no body at all.
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
 * The Respond helper on the Handler context of a route whose `output` is a
 * status map. It pairs a declared status with that status's body, as the Fail
 * helper pairs a tag with its fields: a status declared `null` takes no value,
 * and refuses one.
 *
 * ```ts
 * return respond(201, order)
 * return respond(204)
 * ```
 */
// One signature with the value on a rest tuple the status picks, rather than
// an overload per arity: a rejected call reports the one pairing it broke
// instead of an essay over every overload.
export interface Respond<Outputs> {
  <Status extends keyof Outputs>(
    status: Status,
    ...value: ArgsFor<Outputs[Status]>
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
