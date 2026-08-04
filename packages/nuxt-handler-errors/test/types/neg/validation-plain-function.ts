/**
 * **There is no plain-function validator escape hatch** (SPEC.md §3.3, §11.4).
 *
 * Accepting a `(value: unknown) => T` would reopen h3's `safeParse` hole
 * verbatim, because a `safeParse` reference *is* exactly that shape — the two
 * would be indistinguishable at the type level, and the one that silently
 * disables validation would compile again.
 *
 * Consumers whose validator predates Standard Schema wrap it themselves; the
 * module offers no adapter, and this fixture is what keeps that true.
 */

import {
  defineTypedEventHandler,
  invalidInput,
} from '../../../src/runtime/shared'

export default defineTypedEventHandler(
  {
    errors: [invalidInput],
    body: (value: unknown) => value as { name: string },
  },
  async (_event, { body }) => ({ name: body.name })
)
