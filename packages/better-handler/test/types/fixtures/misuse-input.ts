/**
 * A DELIBERATELY BROKEN fixture, compiled by `input-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to
 * let each diagnostic through so the suite can read it.
 */

import * as v from 'valibot'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../../src/runtime/server'

const pagination = z.object({ page: z.coerce.number() })
const paging = v.object({ page: v.string() })
const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })

// --- a key that names no source ---------------------------------------------

export const misspelled = defineBetterEventHandler(
  {
    input: {
      query: pagination,
      quary: sorting,
    },
  },
  () => null
)

export const preRename = defineBetterEventHandler(
  {
    input: {
      routerParams: pagination,
    },
  },
  () => null
)

// --- a composed slot --------------------------------------------------------

export const overlapping = defineBetterEventHandler(
  {
    input: {
      query: [pagination, paging],
    },
  },
  () => null
)

export const primitive = defineBetterEventHandler(
  {
    input: {
      body: [pagination, z.string()],
    },
  },
  () => null
)

// --- a declaration that declares nothing ------------------------------------

export const bare = defineBetterEventHandler({}, () => null)

export const emptyInput = defineBetterEventHandler({ input: {} }, () => null)

// --- the Handler context ----------------------------------------------------

export const undeclaredSource = defineBetterEventHandler(
  { input: { query: pagination } },
  (_event, context) => context.body
)

export const noFail = defineBetterEventHandler(
  { input: { query: pagination } },
  (_event, context) => context.fail
)

export const reservedFail = defineBetterEventHandler(
  {
    input: { query: pagination },
    errors: { 'order-locked': { status: 409 } },
  },
  (_event, { fail }) => {
    throw fail('validation-failed')
  }
)
