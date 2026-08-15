/**
 * What must not compile, and where the error lands. Every case here reports
 * at the declaration - at the offending key where possible - never as a lazy
 * poison on a later property access, and never as an overload-collapse
 * paragraph (there are no overloads).
 */
import { z } from 'zod'
import { defineValidatedEventHandler } from '../server'
import { pagination, sorting } from './reuse'

// --- A stray key beside valid ones is rejected at that key ----------------

defineValidatedEventHandler(
  {
    validate: {
      query: z.object({ page: z.coerce.number() }),
      // @ts-expect-error - the guard's sentence names the four sources:
      // "'boyd' is not a validation source - the sources are routerParams,
      // query, headers and body"
      boyd: z.object({ name: z.string() }),
    },
  },
  async (_event, _validated) => null
)

// --- A value that is not a schema is rejected -----------------------------

defineValidatedEventHandler(
  {
    validate: {
      // @ts-expect-error - a number is not a Standard Schema
      query: 42,
    },
  },
  async (_event, _validated) => null
)

// --- Reading an undeclared source names the missing key -------------------

defineValidatedEventHandler(
  { validate: { query: z.object({ page: z.coerce.number() }) } },
  async (_event, validated) => {
    // @ts-expect-error - body was never declared; it is absent, not unknown
    return validated.body
  }
)

// --- Composition rule: outputs must be disjoint ---------------------------

const paginationTwin = z.object({ page: z.coerce.number() })

defineValidatedEventHandler(
  {
    validate: {
      // @ts-expect-error - both schemas output 'page'; an intersection would
      // lie about which value survives, so the overlap is refused here
      query: [pagination, paginationTwin],
    },
  },
  async (_event, _validated) => null
)

// --- Composition rule: every composed output must be a plain object -------

defineValidatedEventHandler(
  {
    validate: {
      // @ts-expect-error - a string output cannot merge with an object output
      body: [z.string(), z.object({ name: z.string() })],
    },
  },
  async (_event, _validated) => null
)

// The object test is structural, not Record-based - but arrays are still not
// mergeable objects.
defineValidatedEventHandler(
  {
    validate: {
      // @ts-expect-error - an array output cannot take part in a merge
      body: [z.array(z.string()), z.object({ name: z.string() })],
    },
  },
  async (_event, _validated) => null
)

// --- A widened array cannot compose - tuples only -------------------------

const widened: Array<typeof pagination | typeof sorting> = [pagination, sorting]

defineValidatedEventHandler(
  {
    validate: {
      // @ts-expect-error - an array of unknown length cannot type its merge
      query: widened,
    },
  },
  async (_event, _validated) => null
)

// --- An explicit response type argument is an arity error -----------------

// The sibling's rule: `Response` has no default, so annotating the schemas
// type argument cannot silently collapse the response type to `any`.
// @ts-expect-error - one explicit type argument is an arity error
defineValidatedEventHandler<{ query: typeof pagination }>(
  { validate: { query: pagination } },
  async (_event, _validated) => null
)
