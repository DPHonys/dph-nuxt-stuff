/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint (SPEC.md §9.9 trap 1).
 *
 * Supplying an explicit type argument to the definer is the trap that would
 * otherwise collapse the success type to `any` in silence. `Response` is
 * declared with **no default**, which turns it into an arity error instead —
 * the trap becomes unrepresentable rather than merely documented
 * (SPEC.md §3.1).
 *
 * Asserted: `TS2558`, naming the arity. Never a silent `any`.
 */

import {
  defineErrors,
  defineTypedEventHandler,
} from '../../../src/runtime/shared'

const authErrors = defineErrors({
  unauthorized: { status: 401 },
})

export default defineTypedEventHandler<{ id: string }>(
  { errors: [authErrors] },
  (_event, { fail }) => {
    return fail('unauthorized')
  }
)
