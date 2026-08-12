import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import type {
  SchemasOfHandler,
  ValidateSchemas,
  ValidatedContext,
  ValidatedEventHandler,
} from '../../src/runtime/types'

/**
 * The flat form's compile-time contract, asserted by the compiler under
 * `pnpm typecheck`. Ported from the typing prototype's `checks.ts` rather than
 * re-derived: those assertions are what "typed correctly" was settled to mean,
 * and they were green under `tsc --noEmit` before a line of this package
 * existed.
 *
 * The context type is source-agnostic - one mapped type over whatever the
 * declaration names - so the assertions exercise all four sources even while
 * only `query` is read at runtime; the reads for the rest land with their own
 * request-level tests.
 *
 * The suite at the bottom only keeps the file in vitest's inventory.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

// ---------------------------------------------------------------------------
// Per-source OUTPUT inference, zod - coercion and transform make output ≠
// input, so these fail if the wrong side is inferred.
// ---------------------------------------------------------------------------

const pageQuery = z.object({ page: z.coerce.number() })
const userBody = z.object({
  name: z.string(),
  tags: z.string().transform((s) => s.split(',')),
})

export const zodHandler = defineValidatedEventHandler(
  { query: pageQuery, body: userBody },
  async (event, { query, body }) => {
    type _e = Expect<Equal<typeof event, H3Event<EventHandlerRequest>>>
    type _q = Expect<Equal<typeof query, { page: number }>>
    type _b = Expect<Equal<typeof body, { name: string; tags: string[] }>>

    // @ts-expect-error - an undeclared source is absent from the second param
    type _no = typeof body & { never: (typeof _zodValidated)['headers'] }

    return { page: query.page, tags: body.tags }
  }
)

declare const _zodValidated: ValidatedContext<{
  query: typeof pageQuery
  body: typeof userBody
}>

/** Undeclared sources are ABSENT - not `unknown`, not optional. */
export type AssertOnlyDeclaredSources = Expect<
  Equal<keyof typeof _zodValidated, 'query' | 'body'>
>

// ---------------------------------------------------------------------------
// Per-source OUTPUT inference, valibot - same shape, second library.
// ---------------------------------------------------------------------------

const idParams = v.object({ id: v.pipe(v.string(), v.transform(Number)) })
const tokenHeaders = v.object({ authorization: v.string() })

defineValidatedEventHandler(
  { routerParams: idParams, headers: tokenHeaders },
  (event, { routerParams, headers }) => {
    type _p = Expect<Equal<typeof routerParams, { id: number }>>
    type _h = Expect<Equal<typeof headers, { authorization: string }>>

    return { id: routerParams.id, token: headers.authorization }
  }
)

// ---------------------------------------------------------------------------
// Mixed libraries in one call - Standard Schema is the only contract.
// ---------------------------------------------------------------------------

defineValidatedEventHandler(
  { query: pageQuery, body: v.object({ ok: v.boolean() }) },
  (event, { query, body }) => {
    type _q = Expect<Equal<typeof query, { page: number }>>
    type _b = Expect<Equal<typeof body, { ok: boolean }>>

    return { page: query.page, ok: body.ok }
  }
)

// ---------------------------------------------------------------------------
// Async schemas - a schema whose `validate` returns a promise infers the same
// output type. The wrapper awaits at runtime; the typing is unchanged.
// ---------------------------------------------------------------------------

const asyncBody = v.pipeAsync(
  v.objectAsync({ email: v.string() }),
  v.checkAsync(async () => true)
)
const asyncZodBody = z.object({ email: z.string() }).refine(async () => true)

defineValidatedEventHandler({ body: asyncBody }, (event, { body }) => {
  type _b = Expect<Equal<typeof body, { email: string }>>

  return body.email
})

defineValidatedEventHandler({ body: asyncZodBody }, (event, { body }) => {
  type _b = Expect<Equal<typeof body, { email: string }>>

  return body.email
})

// ---------------------------------------------------------------------------
// The return type still flows to Nitro's typed routes: Nitro reads the default
// export as an h3 `EventHandler<Request, Response>`, so emulate its extraction
// and check the async handler's Response survives intact.
// ---------------------------------------------------------------------------

type ResponseOf<T> =
  T extends EventHandler<EventHandlerRequest, infer R> ? R : never

export type AssertResponseFlowsToNitro = Expect<
  Equal<
    Awaited<ResponseOf<typeof zodHandler>>,
    { page: number; tags: string[] }
  >
>

/** And the returned value is assignable where Nitro wants a plain handler. */
export const asVanilla: EventHandler = zodHandler

// ---------------------------------------------------------------------------
// Edge: a schema widened to bare `StandardSchemaV1` degrades to `unknown` - a
// Standard Schema limitation (`types` is optional). Documented, not an error.
// ---------------------------------------------------------------------------

declare const widened: StandardSchemaV1

// Inside a function, never called: `widened` is declared, not defined, and
// vitest runs this file as well as compiling it.
export function widenedSchemaDegradesToUnknown(): void {
  defineValidatedEventHandler({ query: widened }, (event, { query }) => {
    type _q = Expect<Equal<typeof query, unknown>>

    return { query }
  })
}

// ---------------------------------------------------------------------------
// Edge: empty options - the second parameter has no keys.
// ---------------------------------------------------------------------------

defineValidatedEventHandler({}, (event, _validated) => {
  type _none = Expect<Equal<keyof typeof _validated, never>>

  return 'ok'
})

// ---------------------------------------------------------------------------
// Deliberate misuse still errors.
// ---------------------------------------------------------------------------

defineValidatedEventHandler(
  // @ts-expect-error - a non-schema value in a source slot
  { query: 42 },
  () => 'x'
)

defineValidatedEventHandler(
  // @ts-expect-error - a typo'd source key, ALONE in the object, is rejected
  { qeury: pageQuery },
  () => 'x'
)

/**
 * The response type parameter has no default, so an explicit type argument is
 * an arity error rather than a silent collapse of the success type to `any`.
 */
export function responseTypeArgumentIsAnArityError(): void {
  // @ts-expect-error - expected 2-3 type arguments, but got 1
  defineValidatedEventHandler<{ query: typeof pageQuery }>(
    { query: pageQuery },
    (event, { query }) => query.page
  )
}

// ---------------------------------------------------------------------------
// The `Exclude<S[K], undefined>` requirement.
//
// The hazard is options reaching the wrapper through the widened
// `ValidateSchemas` annotation instead of inferred from a literal: every
// source's schema type then carries the constraint's `| undefined`.
// `ValidatedContext` strips it before the `infer Schema extends
// StandardSchemaV1` conditional, so each source degrades to `unknown` - the
// honest floor. The counterfactual below is the proof of necessity.
// ---------------------------------------------------------------------------

/** `ValidatedContext` with the `Exclude` removed; nothing else changed. */
type NaiveContext<S extends ValidateSchemas> = {
  [K in keyof S]-?: S[K] extends infer Schema extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<Schema>
    : never
}

export type AssertFloorKeys = Expect<
  Equal<
    keyof ValidatedContext<ValidateSchemas>,
    'routerParams' | 'query' | 'headers' | 'body'
  >
>
export type AssertFloorQuery = Expect<
  Equal<ValidatedContext<ValidateSchemas>['query'], unknown>
>
export type AssertFloorBody = Expect<
  Equal<ValidatedContext<ValidateSchemas>['body'], unknown>
>

/** Without the `Exclude`, the same floor is `never` - every source unusable. */
export type AssertNaiveFloorQueryIsNever = Expect<
  Equal<NaiveContext<ValidateSchemas>['query'], never>
>
export type AssertNaiveFloorBodyIsNever = Expect<
  Equal<NaiveContext<ValidateSchemas>['body'], never>
>

/** Inline options are unaffected either way - the hazard is annotation-only. */
export type AssertInlineOptionsUnaffected = Expect<
  Equal<
    NaiveContext<{ query: typeof pageQuery }>,
    ValidatedContext<{ query: typeof pageQuery }>
  >
>

/** And through an actual call, the way a user meets it. */
declare const widenedSchemas: ValidateSchemas

export function widenedOptionsDegradeToUnknown(): void {
  defineValidatedEventHandler(widenedSchemas, (event, _validated) => {
    type _keys = Expect<
      Equal<
        keyof typeof _validated,
        'routerParams' | 'query' | 'headers' | 'body'
      >
    >
    type _q = Expect<Equal<(typeof _validated)['query'], unknown>>
    type _b = Expect<Equal<(typeof _validated)['body'], unknown>>

    return null
  })
}

// ---------------------------------------------------------------------------
// The phantom, read back through `SchemasOfHandler` - the supported door.
// `ValidatedEventHandler`'s `Schemas` defaults to `never`, so a handler that
// declared nothing reads back as "declares nothing" rather than as "validates
// everything, contents unknown".
// ---------------------------------------------------------------------------

/** A branded handler round-trips exactly. */
export type AssertPhantomRoundTrips = Expect<
  Equal<
    SchemasOfHandler<
      ValidatedEventHandler<
        EventHandlerRequest,
        string,
        { query: typeof pageQuery }
      >
    >,
    { query: typeof pageQuery }
  >
>

/** The define signature's output is readable through the same door. */
export type AssertPhantomFromDefine = Expect<
  Equal<
    SchemasOfHandler<typeof zodHandler>,
    { query: typeof pageQuery; body: typeof userBody }
  >
>

/** Declared nothing → `never`; this is what the default decides. */
export type AssertUndeclaredYieldsNever = Expect<
  Equal<SchemasOfHandler<ValidatedEventHandler>, never>
>

/**
 * A plain h3 handler, never branded → `never`. This one needs no `Exclude`:
 * `{ __validatedSchemas__?: infer S }` is a weak type and `EventHandler` shares
 * no property with it, so the match fails outright.
 */
export type AssertVanillaYieldsNever = Expect<
  Equal<SchemasOfHandler<EventHandler>, never>
>

/**
 * An untyped (`any`) handler → `never`, and ONLY because of `IsAny`: `any`
 * takes BOTH branches of a conditional, so without the guard the result is
 * `unknown` - no longer the "declares nothing" sentinel, and enough to make a
 * downstream `S extends { query: infer Q }` quietly take the wrong branch.
 */
export type AssertAnyYieldsNever = Expect<Equal<SchemasOfHandler<any>, never>>

type NaiveSchemasOf<T> = T extends { __validatedSchemas__?: infer S }
  ? Exclude<S, undefined>
  : never

export type AssertAnyWithoutIsAnyIsUnknown = Expect<
  Equal<NaiveSchemasOf<any>, unknown>
>

/** Keeps the file in vitest's inventory. */
describe('the flat declaration surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(zodHandler).toBeTypeOf('function')
  })
})
