/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint.
 *
 * `.pick()` of a tag the catalogue does not declare. Asserted: `TS2345`, with a
 * message listing the **real** tags — a narrowing that silently picked nothing
 * would publish a contract for failures the route can never emit, which is the
 * exact dishonesty `.pick()` exists to prevent.
 */

import { defineErrors, payload } from '../../../src/runtime/shared'

const authErrors = defineErrors({
  unauthorized: { status: 401 },
  forbidden: {
    status: 403,
    payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
  },
  'token-expired': { status: 401, payload: payload<{ expiredAt: string }>() },
})

export const narrowed = authErrors.pick('forbiden')
