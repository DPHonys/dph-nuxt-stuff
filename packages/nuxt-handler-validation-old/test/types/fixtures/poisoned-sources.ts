/**
 * A DELIBERATELY BROKEN fixture. It is compiled by `poison-diagnostics.test.ts`
 * through the harness, never by `pnpm typecheck` - the package tsconfig
 * excludes this directory, because every declaration below is meant to fail.
 *
 * Each handler consumes a source that one of the five composition poisons has
 * claimed. What is under test is the *sentence* the author is shown: a poison
 * exists so the diagnostic says what they did, rather than "property does not
 * exist on type `never`".
 */

import * as v from 'valibot'
import { z } from 'zod'
import {
  defineValidation,
  defineValidatedEventHandler,
} from '../../../src/runtime/server'

const pagination = defineValidation('pagination', {
  query: z.object({ page: z.coerce.number() }),
})
const impostor = defineValidation('pagination', {
  query: z.object({ cursor: z.string() }),
})
const filter = defineValidation({
  query: v.object({ filter: v.optional(v.string()) }),
})
const filterAsNumber = defineValidation({
  query: z.object({ filter: z.coerce.number() }),
})
const numericQuery = defineValidation({ query: z.string().transform(Number) })
const sneaky = defineValidation({ query: z.object({ pagination: z.string() }) })

/** Two different sets sharing one name on one source. */
export const sharedName = defineValidatedEventHandler(
  [...pagination, ...impostor],
  (event, { query }) => query.pagination.page
)

/** A set name colliding with an unnamed fragment's output key. */
export const nameOverKey = defineValidatedEventHandler(
  [...pagination, ...sneaky],
  (event, { query }) => query.pagination
)

/** Colliding unnamed outputs that are not all plain objects. */
export const nonObjectMerge = defineValidatedEventHandler(
  [...numericQuery, ...filter],
  (event, { query }) => query.filter
)

/** A non-object unnamed output beside a named set. */
export const nonObjectBesideNamed = defineValidatedEventHandler(
  [...pagination, ...numericQuery],
  (event, { query }) => query.pagination
)

/** Two unnamed fragments contributing the same output key. */
export const overlappingKeys = defineValidatedEventHandler(
  [...filter, ...filterAsNumber],
  (event, { query }) => query.filter
)
