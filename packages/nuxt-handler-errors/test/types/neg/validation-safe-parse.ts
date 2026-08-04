/**
 * **h3's own JSDoc-recommended spelling, inverted** (SPEC.md §3.3).
 *
 * `readValidatedBody(event, Schema.safeParse)` is what h3 1.15.11's
 * documentation tells you to write, and there it *silently disables
 * validation*: `safeParse` returns `{ success: false, error }` rather than
 * throwing, so an invalid body sails through as the result object. Here the
 * same expression has no `~standard` and does not compile — the footgun is
 * unrepresentable rather than discouraged.
 *
 * The inversion is the other half: `body: CreateUser`, the raw schema object
 * `readValidatedBody` crashes on, is the **correct** argument here.
 */

import {
  defineTypedEventHandler,
  invalidInput,
} from '../../../src/runtime/shared'
import { schemaOf } from '../schemas'

const CreateUser = schemaOf<{ name: string }>()

export default defineTypedEventHandler(
  { errors: [invalidInput], body: CreateUser.safeParse },
  async (_event, { body }) => ({ name: body })
)
