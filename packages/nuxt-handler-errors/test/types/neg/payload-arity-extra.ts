/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint.
 *
 * A payload-less variant takes **no** second argument, because `PayloadArgs`
 * resolves to the empty tuple rather than to an optional parameter
 *. Passing one anyway is an error rather than an extra that
 * silently rides along into the wire envelope.
 *
 * Asserted: `TS2554`, naming the arity.
 */

import {
  defineErrors,
  defineTypedEventHandler,
} from '../../../src/runtime/shared'

const authErrors = defineErrors({
  unauthorized: { status: 401 },
})

export default defineTypedEventHandler(
  { errors: [authErrors] },
  (_event, { fail }) => {
    return fail('unauthorized', { reason: 'expired' })
  }
)
