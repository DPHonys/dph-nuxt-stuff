/**
 * A DELIBERATELY BROKEN fixture - the deliberate-error run, compiled by
 * `misuse-diagnostics.test.ts` through the harness and never by
 * `pnpm typecheck` (the package tsconfig excludes this directory).
 *
 * Ported from the sandbox's `src/sandbox/misuse.ts`, with its
 * `@ts-expect-error` comments dropped: there they proved a call was rejected,
 * here the whole point is to let the diagnostic through so a suite can read the
 * sentence it carries and the key it lands on.
 *
 * Every case reports at the declaration - at the offending key where possible -
 * never as a lazy poison on a later property access, and never as an
 * overload-collapse paragraph (there are no overloads).
 */

import * as v from 'valibot'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../../src/runtime/server'

const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})

const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })

// --- A stray key beside valid ones is rejected at that key ----------------

export const strayKey = defineValidatedEventHandler(
  {
    validate: {
      query: z.object({ page: z.coerce.number() }),
      boyd: z.object({ name: z.string() }),
    },
  },
  async (_event, _validated) => null
)

// --- A value that is not a schema is rejected -----------------------------

export const notASchema = defineValidatedEventHandler(
  { validate: { query: 42 } },
  async (_event, _validated) => null
)

// --- Reading an undeclared source names the missing key -------------------

export const undeclaredSource = defineValidatedEventHandler(
  { validate: { query: z.object({ page: z.coerce.number() }) } },
  async (_event, validated) => validated.body
)

// --- Composition rule: outputs must be disjoint ---------------------------

const paginationTwin = z.object({ page: z.coerce.number() })

export const overlappingOutputs = defineValidatedEventHandler(
  {
    validate: {
      query: [pagination, paginationTwin],
    },
  },
  async (_event, _validated) => null
)

// --- Composition rule: every composed output must be a plain object -------

export const primitiveOutput = defineValidatedEventHandler(
  {
    validate: {
      body: [z.string(), z.object({ name: z.string() })],
    },
  },
  async (_event, _validated) => null
)

// The object test is structural, not Record-based - but arrays are still not
// mergeable objects.
export const arrayOutput = defineValidatedEventHandler(
  {
    validate: {
      body: [z.array(z.string()), z.object({ name: z.string() })],
    },
  },
  async (_event, _validated) => null
)

// --- A widened array cannot compose - tuples only -------------------------

const widened: Array<typeof pagination | typeof sorting> = [pagination, sorting]

export const widenedArray = defineValidatedEventHandler(
  {
    validate: {
      query: widened,
    },
  },
  async (_event, _validated) => null
)

// --- An explicit response type argument is an arity error -----------------

// The sibling's rule: `Response` has no default, so annotating the schemas
// type argument cannot silently collapse the response type to `any`.
export const explicitTypeArgument = defineValidatedEventHandler<{
  query: typeof pagination
}>({ validate: { query: pagination } }, async (_event, _validated) => null)
