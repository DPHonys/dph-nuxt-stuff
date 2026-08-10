/**
 * A route file, shaped exactly like a real one.
 *
 * It exists as its own fixture rather than inline in `./extractor.ts` because
 * two different assertions need it and they need it in two different forms:
 *
 * - `./extractor.ts` reads the union back off this module's **source** type;
 * - `../extractor.test.ts` runs **declaration emit** over this file and reads
 *   the union back off the emitted `.d.ts`, which is the form a handler
 *   arrives in from a Nuxt layer or a published package.
 *
 * So it is deliberately a plain default export with nothing test-shaped about
 * it, and it must compile clean.
 */

import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../../../src/runtime/server'

/**
 * Exported so the emitted declaration can never need a name it does not have.
 *
 * The `until: Date` is the point of the third variant: `Serialize` turns it
 * into a `string`, which is what makes a `Date`-carrying payload honest at the
 * client for free.
 */
export const routeErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: Date }>() },
  'quota-exceeded': { status: 429 },
})

export default defineTypedEventHandler(
  { errors: [routeErrors] },
  async (event, { fail }) => {
    const id = event.path.slice(1)

    if (id === '') return fail('user-not-found', { userId: id })
    if (id === 'blocked') return fail('user-suspended', { until: new Date() })
    if (id === 'busy') return fail('quota-exceeded')

    return { id, name: `User ${id}` }
  }
)
