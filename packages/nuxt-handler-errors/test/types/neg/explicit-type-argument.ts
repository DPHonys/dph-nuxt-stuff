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
 *
 * The arity is `2-6` rather than `2-3` because SPEC.md §3.3's schemas ride the
 * same options object and are inferred through three defaulted type parameters
 * appended after `Request`. The protection is unchanged — `Response` still has
 * no default, so one explicit argument is still an arity error rather than a
 * collapse — and the number in the message is the only thing that moved.
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
