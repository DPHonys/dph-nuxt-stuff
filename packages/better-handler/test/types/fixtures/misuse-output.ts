/**
 * A DELIBERATELY BROKEN fixture, compiled by `output-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to
 * let each diagnostic through so the suite can read it.
 */

import { z } from 'zod'
import { defineBetterEventHandler } from '../../../src/runtime/server'

const existing = z.object({ id: z.string() })
const created = z.object({ id: z.string(), createdAt: z.string() })

/** A receipt whose `at` is a string on the wire and a `Date` once parsed. */
const receipt = z.object({
  id: z.string(),
  at: z.string().transform((at) => new Date(at)),
})

declare const isNew: boolean

// --- the Respond helper's pairings ------------------------------------------

export const undeclaredStatus = defineBetterEventHandler(
  { output: { 200: existing, 201: created } },
  (_event, { respond }) => respond(404, { id: '1' })
)

export const valueNotMatchingStatus = defineBetterEventHandler(
  { output: { 200: existing, 201: created } },
  (_event, { respond }) => respond(201, { id: '1' })
)

export const valueOnBodilessStatus = defineBetterEventHandler(
  { output: { 200: existing, 204: null } },
  (_event, { respond }) => respond(204, { id: '1' })
)

export const missingValue = defineBetterEventHandler(
  { output: { 200: existing, 204: null } },
  (_event, { respond }) => respond(200)
)

export const missingNullBody = defineBetterEventHandler(
  { output: { 200: existing, 201: z.null() } },
  (_event, { respond }) => respond(201)
)

export const unionStatus = defineBetterEventHandler(
  { output: { 200: existing, 201: created } },
  (_event, { respond }) => respond(isNew ? 201 : 200, { id: '1' })
)

export const unionBodilessStatus = defineBetterEventHandler(
  { output: { 204: null, 205: null } },
  (_event, { respond }) => respond(isNew ? 204 : 205)
)

// --- a plain return where the map asks for the helper -----------------------

export const plainReturnOnMap = defineBetterEventHandler(
  { output: { 200: existing, 201: created } },
  () => ({ id: '1' })
)

export const plainReturnOnSingleStatus = defineBetterEventHandler(
  { output: { 201: created } },
  () => ({ id: '1', createdAt: '2026-10-25' })
)

// --- the helper where no map offers it --------------------------------------

export const respondOnBareForm = defineBetterEventHandler(
  { output: existing },
  (_event, context) => context.respond(200, { id: '1' })
)

export const respondWithoutOutput = defineBetterEventHandler(
  { errors: { 'order-locked': { status: 409 } } },
  (_event, context) => context.respond(200, { id: '2' })
)

// --- a bare-form return that is not the declared output ---------------------

export const wrongBareReturn = defineBetterEventHandler(
  { output: existing },
  () => ({ id: 1 })
)

export const transformedBareReturn = defineBetterEventHandler(
  { output: receipt },
  () => ({ id: '1', at: new Date() })
)

// --- a declaration that declares nothing ------------------------------------

export const emptyOutput = defineBetterEventHandler({ output: {} }, () => null)

export const emptyEverything = defineBetterEventHandler(
  { input: {}, errors: {}, output: {} },
  () => null
)
