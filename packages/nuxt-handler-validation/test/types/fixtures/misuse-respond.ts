/**
 * A DELIBERATELY BROKEN fixture, compiled by `misuse-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to let
 * each diagnostic through so the suite can read it.
 *
 * Every case here is a map-form Response output answered wrongly - the whole
 * of what the Respond helper promises to refuse.
 */

import { z } from 'zod'
import { defineValidatedEventHandler } from '../../../src/runtime/server'

const existing = z.object({ id: z.string() })
const created = z.object({ id: z.string(), createdAt: z.string() })

// --- A status the map never declared -------------------------------------

export const undeclaredStatus = defineValidatedEventHandler(
  { output: { 200: existing, 201: created } },
  (_event, { respond }) => respond(404, { id: '1' })
)

// --- A value the paired status never promised -----------------------------

export const valueNotMatchingStatus = defineValidatedEventHandler(
  { output: { 200: existing, 201: created } },
  (_event, { respond }) => respond(201, { id: '1' })
)

// --- A plain return, where the map asked for the helper -------------------

export const plainReturnOnMap = defineValidatedEventHandler(
  { output: { 200: existing, 201: created } },
  (_event, _validated) => ({ id: '1' })
)

// --- A single-key map is still a map: no plain-return shortcut ------------

export const plainReturnOnSingleKeyMap = defineValidatedEventHandler(
  { output: { 201: created } },
  (_event, _validated) => ({ id: '1', createdAt: '2026-09-09' })
)

// --- A value handed to a status declared `null` ---------------------------

export const valueOnBodilessStatus = defineValidatedEventHandler(
  { output: { 204: null } },
  (_event, { respond }) => respond(204, { id: '1' })
)

// --- The helper reached for on a bare-form route --------------------------

// The bare form is a plain return, so the Validated context is offered no
// `respond` at all - the same missing-key diagnostic an undeclared source gets.
export const respondOnBareForm = defineValidatedEventHandler(
  { output: existing },
  (_event, validated) => validated.respond(200, { id: '1' })
)
