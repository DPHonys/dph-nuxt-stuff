/**
 * A DELIBERATELY BROKEN fixture - the **array form**'s deliberate-error run,
 * the twin of `misuse-flat-form.ts`. Compiled by `misuse-diagnostics.test.ts`
 * through the harness, never by `pnpm typecheck`.
 *
 * Ported from the prototype's `error-cases-array.ts`. The question it answers
 * is the one the array form raised: with two overloads, does everything
 * collapse to "No overload matches this call" and lose the actionable sentence?
 */

import { z } from 'zod'
import {
  defineValidation,
  defineValidatedEventHandler,
} from '../../../src/runtime/server'

const pageQuery = z.object({ page: z.coerce.number() })
const userBody = z.object({ name: z.string() })
const pagination = defineValidation('pagination', { query: pageQuery })
const impostor = defineValidation('pagination', {
  query: z.object({ cursor: z.string() }),
})

/** A typo'd source key, alone in a fragment beside a spread set. */
export const typoInFragment = defineValidatedEventHandler(
  [...pagination, { qeury: pageQuery }],
  () => 'x'
)

/** A typo BESIDE a valid key, inside a fragment. */
export const typoBesideValid = defineValidatedEventHandler(
  [{ query: pageQuery, boyd: userBody }],
  () => 'x'
)

/**
 * The object-spread trap: `{ ...a, ...b }` where `[...a, ...b]` was meant. The
 * spread keeps `length` in its type, which is what makes it rejectable.
 */
const trap = { ...pagination, ...impostor }

export const objectSpread = defineValidatedEventHandler(trap, () => 'x')

/** Consuming an undeclared source - must NOT collapse. */
export const undeclaredSource = defineValidatedEventHandler(
  [...pagination],
  (event, validated) => validated.body
)

/** Consuming a POISONED source - must not collapse either. */
export const poisonedSource = defineValidatedEventHandler(
  [...pagination, ...impostor],
  (event, { query }) => query.pagination.page
)
