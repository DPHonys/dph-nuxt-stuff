/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint.
 *
 * The mirror of `payload-arity-extra.ts`: a variant that declares a payload
 * **requires** it. Omitting it would put a variant on the wire missing the
 * fields its own generated type promises the client.
 *
 * Asserted: `TS2554`, naming the arity.
 */

import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../../../src/runtime/shared'

const userErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
})

export default defineTypedEventHandler(
  { errors: [userErrors] },
  (_event, { fail }) => {
    return fail('user-not-found')
  }
)
