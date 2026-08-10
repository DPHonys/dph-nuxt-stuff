/**
 * The other half of the duplicate-tag guard, and the half that is easy to lose.
 *
 * Two catalogues declaring an **identical** member must compose **clean**
 *. The members collapse to one union member, so `IsUnion` is
 * false and nothing fires — only a genuine divergence in status or payload is a
 * conflict. A guard that flagged this would make a shared variant impossible to
 * re-export, and it would do so silently at every composition site.
 *
 * Must compile with zero diagnostics.
 */

import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../../../src/runtime/server'
import type { Equal, Expect } from '../vocabulary'

const billing = defineErrors({
  'payment-required': { status: 402, payload: payload<{ planId: string }>() },
  'quota-exceeded': { status: 429, payload: payload<{ retryAfter: number }>() },
})

/** The same tag, the same status, the same payload — re-declared verbatim. */
const legacyBilling = defineErrors({
  'payment-required': { status: 402, payload: payload<{ planId: string }>() },
  'plan-archived': { status: 410 },
})

const _handler = defineTypedEventHandler(
  { errors: [billing, legacyBilling] },
  (event, { fail }) => {
    if (event.path === '/broke')
      return fail('payment-required', { planId: 'pro' })
    return { ok: true }
  }
)

type Declared = NonNullable<(typeof _handler)['__declaredErrors__']>

/** The duplicate collapsed to one member rather than being flagged or doubled. */
type _tags = Expect<
  Equal<
    Declared['tag'],
    'payment-required' | 'quota-exceeded' | 'plan-archived'
  >
>

type _successStillInfers = Expect<
  Equal<Awaited<ReturnType<typeof _handler>>, { ok: boolean }>
>
