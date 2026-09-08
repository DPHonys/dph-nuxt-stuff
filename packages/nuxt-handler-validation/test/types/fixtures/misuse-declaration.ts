/**
 * A DELIBERATELY BROKEN fixture, compiled by `misuse-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to let
 * each diagnostic through so the suite can read it.
 */

import * as v from 'valibot'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../../src/runtime/server'
import type { ValidationSchemas } from '../../../src/runtime/types'

const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})

const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })

// --- A stray key beside valid ones is rejected at that key ----------------

export const strayKey = defineValidatedEventHandler(
  {
    input: {
      query: z.object({ page: z.coerce.number() }),
      boyd: z.object({ name: z.string() }),
    },
  },
  async (_event, _validated) => null
)

// --- A value that is not a schema is rejected -----------------------------

export const notASchema = defineValidatedEventHandler(
  { input: { query: 42 } },
  async (_event, _validated) => null
)

// --- Reading an undeclared source names the missing key -------------------

export const undeclaredSource = defineValidatedEventHandler(
  { input: { query: z.object({ page: z.coerce.number() }) } },
  async (_event, validated) => validated.body
)

// --- Composition rule: outputs must be disjoint ---------------------------

const paginationTwin = z.object({ page: z.coerce.number() })

export const overlappingOutputs = defineValidatedEventHandler(
  {
    input: {
      query: [pagination, paginationTwin],
    },
  },
  async (_event, _validated) => null
)

// --- Composition rule: every composed output must be a plain object -------

export const primitiveOutput = defineValidatedEventHandler(
  {
    input: {
      body: [z.string(), z.object({ name: z.string() })],
    },
  },
  async (_event, _validated) => null
)

// The object test is structural, but an array is still not a mergeable object.
export const arrayOutput = defineValidatedEventHandler(
  {
    input: {
      body: [z.array(z.string()), z.object({ name: z.string() })],
    },
  },
  async (_event, _validated) => null
)

// --- A widened array cannot compose - tuples only -------------------------

const widened: Array<typeof pagination | typeof sorting> = [pagination, sorting]

export const widenedArray = defineValidatedEventHandler(
  {
    input: {
      query: widened,
    },
  },
  async (_event, _validated) => null
)

// --- A declaration annotated with the public type guarantees nothing ------

// Annotating widens the declaration to the interface, whose four keys are all
// optional, so no source is guaranteed and none is delivered - `body` and the
// `query` written right here get the same error. `satisfies` keeps both.
const annotatedSchemas: ValidationSchemas = {
  query: z.object({ page: z.coerce.number() }),
}

export const annotatedDeclaration = defineValidatedEventHandler(
  { input: annotatedSchemas },
  async (_event, validated) => ({
    undeclared: validated.body,
    declared: validated.query,
  })
)

// --- A declaration must declare something --------------------------------

// Both halves are optional, so bare `{}` is what the "declare something" guard
// is for: an unsatisfiable property naming the two halves.
export const declaresNothing = defineValidatedEventHandler(
  {},
  async (_event, _validated) => null
)

// --- A return that is not the declared output is refused ------------------

const user = z.object({ id: z.string(), name: z.string() })

export const wrongResponse = defineValidatedEventHandler({ output: user }, () =>
  Number(42)
)

// --- The old `validate` key is gone, with no alias ------------------------

// The rename to `input` is a clean break: `validate` is an unknown key on the
// options object, which is what the compiler reports - the "declare something"
// guard is missing from this literal too, but the unknown key is reported
// first and alone.
export const legacyValidateKey = defineValidatedEventHandler(
  { validate: { query: pagination } },
  async (_event, _validated) => null
)

// --- The old `routerParams` source name is gone, with no alias ------------

// The rename to `route` is a clean break too: the old name is a stray key like
// any other, told the four sources by their current names.
export const legacyRouterParamsKey = defineValidatedEventHandler(
  {
    input: {
      query: z.object({ page: z.coerce.number() }),
      routerParams: z.object({ id: z.string() }),
    },
  },
  async (_event, _validated) => null
)
