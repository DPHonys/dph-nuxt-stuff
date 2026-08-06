/**
 * The layered definer: core's `defineTypedEventHandler` plus input validation,
 * with core knowing nothing about it.
 *
 * ## The one seam this package rides
 *
 * Core resolves a raised tag against the route's **composed catalogues at run
 * time** — that is what makes the `invalid-input` status swappable — but the
 * resolver lives behind a module-private symbol this package cannot (and must
 * not) reach. The route's own `fail` is the public door to the same lookup, so
 * {@link failValidation} raises *through it* and tells the two outcomes apart
 * by the wire contract itself: a declared failure wears the marker
 * (`DECLARED_ERROR_KEY`), and core's unknown-tag throw is a plain `Error` that
 * never does. Nothing here spells the marker's address by hand — the key is
 * imported, and its position on a server-side `H3Error` is `error.data`,
 * exactly where core's raise site puts it.
 */

import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '@dphonys/nuxt-handler-errors/server'
import { DECLARED_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import { createError, getQuery, getRouterParams, readBody } from 'h3'
import type { H3Event } from 'h3'
import type {
  DefineValidatedEventHandler,
  StandardSchemaV1,
  ValidationIssue,
  ValidationLocation,
  ValidationTag,
} from './types'
import { hasDeclaredSchemas, validateDeclaredInput } from './validate'
import type { DeclaredSchemas } from './validate'

/**
 * The tag this package raises a validation failure under.
 *
 * Typed as {@link ValidationTag} so the literal in `./types` and the one the
 * catalogue is keyed by cannot drift apart without a compile error here.
 */
const VALIDATION_TAG: ValidationTag = 'invalid-input'

/**
 * The status a malformed request is answered with when the route did not
 * declare a variant of its own.
 *
 * Deliberately un-annotated: `const` infers the literal `400`, and a wider
 * annotation would widen the shipped catalogue's `status` and take a route's
 * published type with it.
 */
const VALIDATION_STATUS = 400

/**
 * This package's own catalogue for a malformed request.
 *
 * **One plain catalogue value, and an entirely ordinary one.** It is a
 * `defineErrors` product like any other: it composes, it is subject to the
 * duplicate-tag guard, it has `.pick()` (vacuously). Nothing about it is
 * special-cased anywhere in this file.
 *
 * **It is never implicitly present.** A route that declares a schema and does
 * not list it still validates and still fails — unmarked, through the ordinary
 * Nuxt error channel — so the union a route publishes is exactly what it wrote
 * in `errors: [...]`.
 *
 * **One variant, not one per location.** `location` sits on the *issue*, which
 * is what lets one response report a bad `body` and a bad `query` together.
 */
export const invalidInput = defineErrors({
  [VALIDATION_TAG]: {
    status: VALIDATION_STATUS,
    payload: payload<{ issues: ValidationIssue[] }>(),
  },
})

/**
 * Where each declared location's raw value comes from.
 *
 * Three h3 utilities and no cleverness. A `Record` keyed by the closed union
 * rather than a cascade, so a fourth location — rejected today, and a later
 * major could still add one — is a compile error here rather than a silent
 * fall-through onto whichever reader the cascade ended with.
 */
const READERS: Record<ValidationLocation, (event: H3Event) => unknown> = {
  body: (event) => readBody(event),
  query: (event) => getQuery(event),
  params: (event) => getRouterParams(event),
}

/** The one shape of `fail` this file calls — the runtime view, not the typed one. */
type RawFail = (tag: string, fields?: Record<string, unknown>) => never

/**
 * Whether a thrown value is a marked declared failure, by the wire contract:
 * the reserved key on the error's own `data`, which is where core's raise site
 * puts it on the server side.
 */
function isMarked(thrown: unknown): boolean {
  const marker = (thrown as { data?: Record<string, unknown> } | null)?.data?.[
    DECLARED_ERROR_KEY
  ]

  return typeof marker === 'object' && marker !== null
}

/**
 * Raise a validation failure, marked if the route listed a catalogue for it.
 *
 * The raise goes through the route's own `fail`, so the tag is resolved
 * against the **composed catalogues at run time** — which is what keeps the
 * status swappable, and what makes opting out free: no catalogue, no marker,
 * and the failure lands in the ordinary channel with the union the route
 * published still exactly right.
 *
 * The unmarked throw carries the same issues in `data`, one hop shallower.
 * It costs nothing, an opted-out route's client can still read them, and it is
 * deliberately *not* the marker: core's `declaredError` answers `undefined`
 * for it, because the route never declared it.
 */
function failValidation(
  fail: RawFail,
  issues: readonly ValidationIssue[]
): never {
  try {
    fail(VALIDATION_TAG, { issues })
  } catch (thrown) {
    // The route declared the tag: `fail` produced the marked variant at the
    // route's own status. Re-throw it untouched.
    if (isMarked(thrown)) throw thrown
  }

  // The route did not declare it — `fail`'s unknown-tag throw is a plain
  // `Error` — so this is the opt-out path: still a 400, still machine-readable,
  // never marked.
  throw createError({
    statusCode: VALIDATION_STATUS,
    statusMessage: 'Bad Request',
    message: 'Invalid input',
    data: { issues },
  })
}

/** The runtime view of the options object, as this file reads it. */
interface RawOptions {
  errors: never
  body?: StandardSchemaV1 | undefined
  query?: StandardSchemaV1 | undefined
  params?: StandardSchemaV1 | undefined
}

/**
 * Declare the failures a route can produce plus, for every schema on the same
 * options object, its parsed output on the same context.
 *
 * **Validation runs before the handler body, and that ordering has a
 * consequence this package documents rather than solves.** On a route whose
 * auth check lives in the handler, a malformed request from an unauthenticated
 * caller is answered with issue messages that name field names before it is
 * answered with a 401. The answer is auth in Nitro middleware, which runs
 * first.
 *
 * The no-schema route is handed to core untouched, so a route that declares
 * none of this is byte-for-byte a core route.
 *
 * The cast at the end is the same claim core's own definer makes: the
 * validating form is `async`, so its return type is a `Promise` of an
 * unresolved type parameter, which nothing can prove inhabits `Response` —
 * however true it is (h3 awaits whatever a handler returns).
 */
export const defineValidatedEventHandler: DefineValidatedEventHandler = ((
  options: RawOptions,
  handler: (event: H3Event, ctx: Record<string, unknown>) => unknown
) => {
  const schemas: DeclaredSchemas = {
    body: options.body,
    query: options.query,
    params: options.params,
  }

  if (!hasDeclaredSchemas(schemas)) {
    return defineTypedEventHandler({ errors: options.errors }, handler as never)
  }

  return defineTypedEventHandler(
    { errors: options.errors },
    async (event, { fail }) => {
      const { issues, values } = await validateDeclaredInput(
        schemas,
        (location) => READERS[location](event)
      )

      if (issues.length > 0) failValidation(fail as RawFail, issues)

      // Reserved-last, for the reason the wire marker is built that way: the
      // fixed names win over anything the spread carries. `values` is keyed by
      // location and cannot collide today — this is what keeps that true the
      // day a fourth key joins either side.
      return handler(event, { ...values, fail })
    }
  )
}) as unknown as DefineValidatedEventHandler
