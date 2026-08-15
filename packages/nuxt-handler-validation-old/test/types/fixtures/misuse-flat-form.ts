/**
 * A DELIBERATELY BROKEN fixture - the **flat form**'s deliberate-error run,
 * compiled by `misuse-diagnostics.test.ts` through the harness and never by
 * `pnpm typecheck` (the package tsconfig excludes this directory).
 *
 * Ported from the prototype's `error-cases.ts`, re-cut around the source-key
 * guard: its two non-schema-value cases are asserted as rejections in
 * `handler-surface.test.ts` instead, since what is under test *here* is what an
 * author reads. The assertions next door prove a call is rejected; only a
 * compiler run says whether the diagnostic is one anybody can act on.
 */

import { z } from 'zod'
import {
  defineValidation,
  defineValidatedEventHandler,
} from '../../../src/runtime/server'

const pageQuery = z.object({ page: z.coerce.number() })
const userBody = z.object({ name: z.string() })

/** A typo'd source key, ALONE - the only case weak-type detection ever caught. */
export const typoAlone = defineValidatedEventHandler(
  { qeury: pageQuery },
  () => 'x'
)

/** The same typo BESIDE a valid key - the hole this guard exists to close. */
export const typoBesideValid = defineValidatedEventHandler(
  { query: pageQuery, boyd: userBody },
  () => 'x'
)

/** A hand-written name marker: not a name, and now not a key either. */
export const forgedName = defineValidatedEventHandler(
  { query: pageQuery, __validationName: 'forged' },
  () => 'x'
)

/** Both definer arities, where a reusable set is DEFINED. */
export const unnamedSet = defineValidation({
  query: pageQuery,
  boyd: userBody,
})

export const namedSet = defineValidation('page', {
  query: pageQuery,
  boyd: userBody,
})

/** Consuming an undeclared source - the case that must NOT collapse. */
export const undeclaredSource = defineValidatedEventHandler(
  { query: pageQuery },
  (event, validated) => validated.body
)
