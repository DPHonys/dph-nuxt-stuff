/**
 * **Only declared locations exist on the context** (SPEC.md §3.3).
 *
 * This route declares `body` and destructures `params`. That is a compile
 * error, not `undefined` at run time — the input is delivered eagerly and flat,
 * and an absent location is an absent *property* rather than an optional one.
 *
 * Lazy accessors would have made this a run-time surprise in the other
 * direction: a handler that never calls one publishes a failure it can never
 * emit (SPEC.md §11.4).
 */

import {
  defineTypedEventHandler,
  invalidInput,
} from '../../../src/runtime/shared'
import { schemaOf } from '../schemas'

const CreateUser = schemaOf<{ name: string }>()

export default defineTypedEventHandler(
  { errors: [invalidInput], body: CreateUser },
  async (_event, { body, params }) => ({ name: body.name, id: params })
)
