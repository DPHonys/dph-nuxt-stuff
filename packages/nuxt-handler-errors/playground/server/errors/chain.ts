import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/server'

/**
 * The three-hop chain's catalogue.
 *
 * **One catalogue for three routes on purpose.** The rule for
 * forwarding a callee's variant verbatim is *"import the same catalogue and
 * declare it"* — which already works with zero new API — so the three hops each
 * `.pick()` their own slice out of this, and `/api/chain/b` picks two: its own
 * `b-upstream` **and** the `c-gone` it may choose to forward untouched.
 *
 * Every payload carries `cookie`, which each hop reads off *its own* request.
 * That is what makes the chain a context-forwarding measurement as well as a
 * depth one: the value the outermost caller set arrives back out of a handler
 * two hops down.
 */
export const chainErrors = defineErrors({
  'c-gone': {
    status: 404,
    payload: payload<{ resource: string; cookie: string }>(),
  },
  'b-upstream': {
    status: 502,
    payload: payload<{ from: string; cookie: string }>(),
  },
  'a-failed': {
    status: 500,
    payload: payload<{ hop: string; cookie: string }>(),
  },
})
