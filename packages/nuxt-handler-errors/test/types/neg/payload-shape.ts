/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint (SPEC.md §9.9 trap 1).
 *
 * The payload handed to `fail` must match the variant's declared payload.
 * Asserted: `TS2322`, naming the field that is wrong — a payload checked only
 * for presence would let a route publish `requiredRole: 'admin' | 'owner'` and
 * send something else.
 */

import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../../../src/runtime/shared'

const authErrors = defineErrors({
  forbidden: {
    status: 403,
    payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
  },
})

export default defineTypedEventHandler(
  { errors: [authErrors] },
  (_event, { fail }) => {
    return fail('forbidden', { requiredRole: 'superuser' })
  }
)
