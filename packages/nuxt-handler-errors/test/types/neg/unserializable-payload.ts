/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint.
 *
 * A `bigint` payload field is a **correctness** failure, not a hygiene one: it
 * does not merely vanish from the client's type, it makes `JSON.stringify`
 * throw inside Nitro's serializer, turning this declared 402 into a genuine
 * unhandled 500.
 *
 * Asserted: the offending field is named in the message. The guard is written
 * as a required property whose type is a template literal for exactly that
 * reason — a branded marker type renders as its own name and says nothing.
 */

import { defineErrors, payload } from '../../../src/runtime/shared'

export const billing = defineErrors({
  'payment-required': {
    status: 402,
    payload: payload<{ planId: string; outstanding: bigint }>(),
  },
})
