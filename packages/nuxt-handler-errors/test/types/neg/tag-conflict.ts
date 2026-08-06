/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint.
 *
 * Two composed catalogues declare `forbidden` with **different** statuses, so
 * the route's published contract would say two things at once.
 *
 * This fixture is what tests the guard-**first** mandate. The
 * assertion is that the colliding tag is still visible in the rendered message:
 * TypeScript truncates the tail of a rendered type at creation time, so
 * `{ errors: C } & ConflictGuard<C>` detects the collision and then buries it
 * behind `ErrorCatalogue<VariantsOf<{…}>>`, leaving the author with no idea
 * which tag collided. Coupling the suite to the compiler's truncation length is
 * the point — a bump that truncates the tag away has genuinely broken the
 * mandate.
 */

import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../../../src/runtime/shared'

const authErrors = defineErrors({
  unauthorized: { status: 401 },
  forbidden: {
    status: 403,
    payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
  },
})

const legacyErrors = defineErrors({
  // Same tag, different status. A genuine divergence, unlike an identical
  // re-declaration — which `../pos/identical-duplicate.ts` asserts compiles.
  forbidden: {
    status: 401,
    payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
  },
})

export default defineTypedEventHandler(
  { errors: [authErrors, legacyErrors] },
  (_event, { fail }) => {
    return fail('unauthorized')
  }
)
