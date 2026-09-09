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

// --- A return that is not the declared output is refused ------------------

// The forwarded `output` constrains the handler's plain return to the schema's
// output type; the parent owns the rule, and it fires through the umbrella.
export const wrongResponse = defineTypedEventHandler(
  { output: z.object({ id: z.string() }) },
  () => Number(42)
)

// --- The old `validate` key is gone, with no alias ------------------------

// The rename to `input` is a clean break: `validate` is an unknown key on the
// options object, and that unknown key is what the compiler reports here - the
// "declare something" guard goes unsatisfied too, but only the unknown key is
// reported, which is what the suite next door asserts.
export const legacyValidateKey = defineTypedEventHandler(
  { validate: { query: z.object({ page: z.coerce.number() }) } },
  () => null
)

// --- The old `routerParams` source name is gone, with no alias ------------

// The rename to `route` is a clean break too: the validation parent's
// stray-key sentence fires at the old name, through the umbrella.
export const legacyRouterParamsKey = defineTypedEventHandler(
  {
    input: {
      query: z.object({ page: z.coerce.number() }),
      routerParams: z.object({ id: z.string() }),
    },
  },
  () => null
)

// --- A map-form output is answered through `respond`, here too ------------

// The parent's rule, fired through the umbrella: a status map declares how the
// handler answers, and a bare value names no status.
export const plainReturnOnMap = defineTypedEventHandler(
  { output: { 201: z.object({ id: z.string() }) } },
  () => ({ id: '1' })
)
