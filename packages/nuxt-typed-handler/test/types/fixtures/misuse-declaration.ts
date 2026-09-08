/**
 * A DELIBERATELY BROKEN fixture, compiled by `misuse-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to let
 * each diagnostic through so the suite can read it.
 */

import { defineError } from '@dphonys/nuxt-handler-errors/server'
import { z } from 'zod'
import { defineTypedEventHandler } from '../../../src/runtime/server'

const userErrors = defineError({
  'user-not-found': { status: 404 },
  forbidden: { status: 403 },
})

// --- The built-in variant's tag cannot be declared ------------------------

const reserved = defineError('validation-failed', { status: 400 })

export const reservedTag = defineTypedEventHandler(
  { errors: [...userErrors, reserved] },
  (_event, { errors }) => {
    throw errors.forbidden()
  }
)

// --- Bare `{}` declares nothing -------------------------------------------

export const bare = defineTypedEventHandler({}, () => null)

// --- Factories can never raise the built-in variant -----------------------

export const failReserved = defineTypedEventHandler(
  {
    input: { query: z.object({ page: z.coerce.number() }) },
    errors: [...userErrors],
  },
  (_event, { errors }) => {
    throw errors.validationFailed()
  }
)

// --- The parents' guards still fire at the key they own -------------------

export const strayKey = defineTypedEventHandler(
  {
    input: {
      query: z.object({ page: z.coerce.number() }),
      boyd: z.object({ name: z.string() }),
    },
  },
  () => null
)

const conflicting = defineError({ 'user-not-found': { status: 410 } })

// --- A tag is kebab-case; the factory is its camelCase form ---------------

export const camelTag = defineError({ userGone: { status: 410 } })

export const divergentTag = defineTypedEventHandler(
  { errors: [...userErrors, ...conflicting] },
  () => null
)

// --- The old `validate` key is gone, with no alias ------------------------

// The rename to `input` is a clean break: `validate` declares nothing, so the
// "declare something" guard is what turns this away.
export const legacyValidateKey = defineTypedEventHandler(
  { validate: { query: z.object({ page: z.coerce.number() }) } },
  () => null
)
