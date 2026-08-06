/**
 * Compile-time assertions, checked by this package's own `tsc --noEmit`.
 *
 * Core proves its type-level claims through a compiler-API harness that
 * compiles fixtures alone and matches diagnostics on code plus message. That
 * harness was not ported when this package was parked — what rides here
 * instead is the affordable subset: positive claims as `Expect<Equal<…>>`
 * aliases, and the four things that must not compile as `@ts-expect-error`
 * lines, which fail the build in *either* direction (an unused directive is
 * its own error).
 *
 * What that subset cannot claim, recorded in the README: diagnostic codes and
 * messages (the guard-first "names the offending field" mandate), and hover
 * budgets (the `ValidationIssue` named-interface rendering mandate).
 */

import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/server'
import { defineValidatedEventHandler, invalidInput } from '../src/index'
import type { StandardSchemaV1, ValidationIssue } from '../src/index'

// ---------------------------------------------------------------------------
// Vocabulary — core's `test/types/vocabulary.ts`, the two helpers used here
// ---------------------------------------------------------------------------

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

// ---------------------------------------------------------------------------
// Fixtures — a minimal conforming schema, no validator in the program
// ---------------------------------------------------------------------------

interface TestSchema<Output> extends StandardSchemaV1<unknown, Output> {
  safeParse: (value: unknown) => { success: true; data: Output }
}

function schemaOf<Output>(): TestSchema<Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'nuxt-handler-validation-fixture',
      validate: (value: unknown) => ({ value: value as Output }),
    },
    safeParse: (value: unknown) => ({ success: true, data: value as Output }),
  }
}

const CreateUser = schemaOf<{ name: string; email: string }>()
const Paging = schemaOf<{ page: number }>()

const authErrors = defineErrors({
  unauthorized: { status: 401 },
})

// ---------------------------------------------------------------------------
// Each declared location arrives as its schema's output, already parsed
// ---------------------------------------------------------------------------

const _typedInputs = defineValidatedEventHandler(
  { errors: [invalidInput], body: CreateUser, query: Paging },
  async (_event, { body, query }) => {
    const _bodyIsParsed: Expect<
      Equal<typeof body, { name: string; email: string }>
    > = true
    const _queryIsParsed: Expect<Equal<typeof query, { page: number }>> = true

    return {
      ok: _bodyIsParsed && _queryIsParsed,
      name: body.name,
      page: query.page,
    }
  }
)

/** The declared union is exactly what `errors: [...]` listed — no more. */
type _declaredUnion = Expect<
  Equal<
    NonNullable<(typeof _typedInputs)['__declaredErrors__']>['tag'],
    'invalid-input'
  >
>

// ---------------------------------------------------------------------------
// Opting out is free, and needs no machinery
// ---------------------------------------------------------------------------

const _optedOut = defineValidatedEventHandler(
  { errors: [authErrors], body: CreateUser },
  async (_event, { body }) => ({ name: body.name })
)

type _optedOutUnion = Expect<
  Equal<
    NonNullable<(typeof _optedOut)['__declaredErrors__']>['tag'],
    'unauthorized'
  >
>

// ---------------------------------------------------------------------------
// The status is swappable
// ---------------------------------------------------------------------------

const appValidation = defineErrors({
  'invalid-input': {
    status: 422,
    payload: payload<{ issues: ValidationIssue[] }>(),
  },
})

const _swapped = defineValidatedEventHandler(
  { errors: [appValidation], body: CreateUser },
  async (_event, { body }) => ({ name: body.name })
)

type _swappedStatus = Expect<
  Equal<
    Extract<
      NonNullable<(typeof _swapped)['__declaredErrors__']>,
      { tag: 'invalid-input' }
    >['status'],
    422
  >
>

// ---------------------------------------------------------------------------
// What must not compile
// ---------------------------------------------------------------------------

/** h3's own `safeParse` spelling, which there silently disables validation. */
const _safeParse = defineValidatedEventHandler(
  {
    errors: [invalidInput],
    // @ts-expect-error a `safeParse` reference has no `~standard`.
    body: CreateUser.safeParse,
  },
  async (_event, _ctx) => ({ ok: true })
)

/** A plain-function validator — the same shape, the same hole. */
const _plainFunction = defineValidatedEventHandler(
  {
    errors: [invalidInput],
    // @ts-expect-error a plain function is not a Standard Schema.
    body: (value: unknown) => value as { name: string },
  },
  async (_event, _ctx) => ({ ok: true })
)

/** Destructuring a location the route never declared is TS2339, not undefined. */
const _undeclaredLocation = defineValidatedEventHandler(
  { errors: [invalidInput], body: CreateUser },
  // @ts-expect-error `params` was not declared, so it is not on the context.
  async (_event, { body, params }) => ({ name: body.name, id: params })
)

/** `headers` is not a location, and the rejection is a compile error. */
const _noHeaderLocation = defineValidatedEventHandler(
  {
    errors: [invalidInput],
    body: CreateUser,
    // @ts-expect-error `headers` is not a declarable location.
    headers: CreateUser,
  },
  async (_event, { body }) => ({ name: body.name })
)

/** An `invalid-input` payload this package cannot fill is rejected. */
const unfillable = defineErrors({
  'invalid-input': {
    status: 422,
    payload: payload<{ issues: ValidationIssue[]; requestId: string }>(),
  },
})

const _unfillablePayload = defineValidatedEventHandler(
  // @ts-expect-error the variant demands a `requestId` this package has no value for.
  { errors: [unfillable], body: CreateUser },
  async (_event, _ctx) => ({ ok: true })
)
