/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint.
 *
 * `fail` is scoped to exactly the declared union. Asserted: `TS2345`, with a
 * message that still **names the declared tags** — the completion list is a
 * language-service surface nothing here can reach, so the diagnostic naming the
 * real tags is the whole of what protects the author's next move
 *.
 */

import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../../../src/runtime/server'

const userErrors = defineErrors({
  unauthorized: { status: 401 },
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
})

export default defineTypedEventHandler(
  { errors: [userErrors] },
  (_event, { fail }) => {
    return fail('mfa-required')
  }
)
