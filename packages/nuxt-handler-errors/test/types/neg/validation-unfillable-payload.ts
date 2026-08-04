/**
 * **A variant this module cannot fill is a compile error naming the field**
 * (SPEC.md §3.3).
 *
 * The status is swappable because the definer resolves the tag against the
 * composed catalogues at run time — which means an app's own `invalid-input`
 * variant is raised by *this module*, and this module has exactly one thing to
 * put in it: `issues`. A variant demanding a `requestId` as well would be
 * raised with that field missing, and the client would narrow onto a payload
 * that is not there.
 *
 * Guarded guard-first, for the same measured reason `ConflictGuard` is: the
 * diagnostic has to name `requestId` rather than render a marker type's own
 * name, and it has to survive TypeScript's truncation of the rendered
 * parameter's tail.
 */

import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../../../src/runtime/shared'
import type { ValidationIssue } from '../../../src/runtime/types'
import { schemaOf } from '../schemas'

const CreateUser = schemaOf<{ name: string }>()

const appValidation = defineErrors({
  'invalid-input': {
    status: 422,
    payload: payload<{ issues: ValidationIssue[]; requestId: string }>(),
  },
})

export default defineTypedEventHandler(
  { errors: [appValidation], body: CreateUser },
  async (_event, { body }) => ({ name: body.name })
)
