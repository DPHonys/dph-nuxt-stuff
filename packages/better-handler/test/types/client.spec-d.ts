import { Schema } from 'effect'
import { defineEventHandler } from 'h3'
import type { NuxtError } from 'nuxt/app'
import { describe, expectTypeOf, it } from 'vitest'
import type { Ref } from 'vue'
import { z } from 'zod'
import { defineBetterEventHandler, defineError } from '../../src/runtime/server'
import { matchError } from '../../src/runtime/shared'
import { toTryResult } from '../../src/runtime/shared/errors/try-result'
import type {
  ErrorArms,
  KnownErrorBody,
  KnownErrorFor,
  KnownErrorsOf,
  KnownErrorsOfHandler,
  RequestFailed,
  TaggedError,
  TryResult,
  UnknownTagFallback,
  VariantsOf,
  Wire,
} from '../../src/runtime/types'

// The client's view of a route's Known errors, from the declaration through
// the wire to a call site. Route-keyed lookups need a generated map, so they
// are `test/types/emitted-map.test.ts`'s; everything here is keyed by type.

// eslint-disable-next-line unicorn/throw-new-error -- Effect's error class builder, extended rather than thrown
class OrderMissing extends Schema.TaggedError<OrderMissing>()('OrderMissing', {
  id: Schema.Number,
  at: Schema.Date,
}) {}

const declared = {
  ...defineError('order-not-found', {
    status: 404,
    schema: z.object({ id: z.number(), at: z.date() }),
  }),
  'order-locked': { status: 409 },
  'order-held': {
    status: 409,
    schema: z.union([
      z.object({ by: z.literal('user'), userId: z.string() }),
      z.object({ by: z.literal('system') }),
    ]),
  },
  // Fields that only look like an `Error`'s: an object of fields, sent.
  'order-invalid': {
    status: 422,
    schema: z.object({ name: z.string(), message: z.string() }),
  },
  OrderMissing: {
    status: 404,
    schema: Schema.toStandardSchemaV1(OrderMissing),
  },
} as const

/** The route's variants as they arrive on a client. */
type Arrived = Wire<KnownErrorsOf<typeof declared>>

type Variant<Tag extends Arrived['_tag']> = Extract<Arrived, { _tag: Tag }>

describe('a route’s Known errors, as they arrive', () => {
  it('carries the tag and the schema’s fields, through JSON', () => {
    expectTypeOf<Variant<'order-not-found'>>().toEqualTypeOf<{
      _tag: 'order-not-found'
      id: number
      at: string
    }>()
  })

  it('carries the tag alone for an entry without a schema', () => {
    expectTypeOf<Variant<'order-locked'>>().toEqualTypeOf<{
      _tag: 'order-locked'
    }>()
  })

  it('keeps each member of a union output its own variant', () => {
    expectTypeOf<Variant<'order-held'>>().toEqualTypeOf<
      | { _tag: 'order-held'; by: 'user'; userId: string }
      | { _tag: 'order-held'; by: 'system' }
    >()
  })

  it('keeps a `name` and a `message` an object of fields declares', () => {
    expectTypeOf<Variant<'order-invalid'>>().toEqualTypeOf<{
      _tag: 'order-invalid'
      name: string
      message: string
    }>()
  })

  it('carries an Effect error class’s fields, and none of its Error or methods', () => {
    expectTypeOf<Variant<'OrderMissing'>>().toEqualTypeOf<{
      _tag: 'OrderMissing'
      readonly id: number
      readonly at: string
    }>()
  })

  it('reads the tag alone from an untyped schema, rather than collapsing to any', () => {
    const _untypedSchema = z.any()
    type Untyped = Wire<
      KnownErrorsOf<{
        'order-odd': { status: 400; schema: typeof _untypedSchema }
      }>
    >

    expectTypeOf<Untyped>().toEqualTypeOf<{ _tag: 'order-odd' }>()
  })
})

describe('KnownErrorsOfHandler', () => {
  const _branded = defineBetterEventHandler({ errors: declared }, () => null)

  it('reads what a branded Handler declares', () => {
    expectTypeOf<KnownErrorsOfHandler<typeof _branded>>().toEqualTypeOf<
      KnownErrorsOf<typeof declared>
    >()
  })

  it('reads nothing from a handler this package did not brand', () => {
    const _plain = defineEventHandler(() => ({ ok: true }))
    const _indexed: { [key: string]: number } = {}
    const _spoofed = Object.assign(() => null, { knownErrors: { _tag: 'x' } })

    expectTypeOf<KnownErrorsOfHandler<typeof _plain>>().toBeNever()
    expectTypeOf<KnownErrorsOfHandler<typeof _indexed>>().toBeNever()
    expectTypeOf<KnownErrorsOfHandler<typeof _spoofed>>().toBeNever()
    // oxlint-disable-next-line typescript/no-explicit-any -- the input under test
    expectTypeOf<KnownErrorsOfHandler<any>>().toBeNever()
  })

  it('reads nothing through Wire from a handler that declares nothing', () => {
    const _plain = defineEventHandler(() => ({ ok: true }))

    expectTypeOf<Wire<KnownErrorsOfHandler<typeof _plain>>>().toBeNever()
  })
})

describe('the Request-failed variant and the try result', () => {
  it('is the built-in catch-all, status undefined when no response came', () => {
    expectTypeOf<RequestFailed>().toEqualTypeOf<{
      _tag: 'request-failed'
      status: number | undefined
      cause: NuxtError
    }>()
  })

  it('makes a try result exhaustive on _tag over the declared variants', async () => {
    const result = await toTryResult<{ id: number }, Arrived>(() =>
      Promise.resolve({ id: 7 })
    )

    expectTypeOf(result).toEqualTypeOf<
      TryResult<{ id: number }, Arrived | RequestFailed>
    >()

    if (result.error === undefined) {
      expectTypeOf(result.data).toEqualTypeOf<{ id: number }>()
      return
    }

    expectTypeOf(result.data).toBeUndefined()

    const { error } = result

    switch (error._tag) {
      case 'order-not-found':
        expectTypeOf(error.at).toBeString()
        break
      case 'order-locked':
      case 'order-held':
      case 'order-invalid':
      case 'OrderMissing':
        break
      case 'request-failed':
        expectTypeOf(error.status).toEqualTypeOf<number | undefined>()
        expectTypeOf(error.cause).toEqualTypeOf<NuxtError>()
        break
      default:
        // Every tag has a case, so nothing is left.
        expectTypeOf(error).toBeNever()
    }
  })

  it('carries only the Request-failed variant for a caller declaring nothing', async () => {
    const result = await toTryResult(() => Promise.resolve('ok'))

    expectTypeOf(result).toEqualTypeOf<TryResult<string, RequestFailed>>()
  })
})

describe('KnownErrorFor and the body', () => {
  it('puts the Tagged error at data.data on a fetched error', () => {
    expectTypeOf<
      NonNullable<Fetched['data']>['data']
    >().toEqualTypeOf<Arrived>()
    expectTypeOf<NonNullable<Fetched['data']>['message']>().toBeString()
  })

  it('is plain NuxtError<unknown> for a route the map does not declare', () => {
    expectTypeOf<KnownErrorFor<'/api/nothing'>>().toEqualTypeOf<
      NuxtError<unknown>
    >()
    expectTypeOf<KnownErrorFor<Request, 'POST'>>().toEqualTypeOf<
      NuxtError<unknown>
    >()
  })
})

type Fetched = NuxtError<KnownErrorBody<Arrived>>

/** An error ref as a fetch composable hands it over. */
declare const fetchedRef: Ref<Fetched | undefined>

/** A vanilla `useFetch` error, or a caught one narrowed with `isNuxtError`. */
declare const vanilla: NuxtError | null

describe('matchError', () => {
  it('reads a fetched error’s variants, the Request-failed one among them', () => {
    expectTypeOf<VariantsOf<Fetched>>().toEqualTypeOf<Arrived | RequestFailed>()
    expectTypeOf<VariantsOf<NuxtError>>().toEqualTypeOf<RequestFailed>()
    expectTypeOf<VariantsOf<Arrived | RequestFailed>>().toEqualTypeOf<
      Arrived | RequestFailed
    >()
  })

  it('asks for one arm per tag, each handed its own variant, and a fallback', () => {
    expectTypeOf(matchError<Fetched>)
      .parameter(1)
      .toEqualTypeOf<ErrorArms<Arrived | RequestFailed>>()
    expectTypeOf<keyof ErrorArms<Arrived | RequestFailed>>().toEqualTypeOf<
      | 'order-not-found'
      | 'order-locked'
      | 'order-held'
      | 'order-invalid'
      | 'OrderMissing'
      | 'request-failed'
    >()
    expectTypeOf(matchError<Fetched>)
      .parameter(2)
      .toEqualTypeOf<UnknownTagFallback>()
    expectTypeOf<
      Parameters<UnknownTagFallback>[0]
    >().toEqualTypeOf<TaggedError>()
  })

  it('compiles with an arm for every tag, each narrowed', () => {
    matchError(
      fetchedRef,
      {
        'order-not-found': (variant) => {
          expectTypeOf(variant).toEqualTypeOf<Variant<'order-not-found'>>()
        },
        'order-locked': (variant) => {
          expectTypeOf(variant).toEqualTypeOf<{ _tag: 'order-locked' }>()
        },
        'order-held': (variant) => {
          expectTypeOf(variant.by).toEqualTypeOf<'user' | 'system'>()
        },
        'order-invalid': () => {},
        OrderMissing: (variant) => {
          expectTypeOf(variant.id).toEqualTypeOf<number>()
        },
        'request-failed': (variant) => {
          expectTypeOf(variant).toEqualTypeOf<RequestFailed>()
        },
      },
      (unknown) => {
        expectTypeOf(unknown._tag).toBeString()
      }
    )
  })

  it('takes a `.try` error as it is', async () => {
    const { error } = await toTryResult<null, Variant<'order-locked'>>(() =>
      Promise.resolve(null)
    )

    matchError(
      error,
      {
        'order-locked': () => {},
        'request-failed': ({ status }) => {
          expectTypeOf(status).toEqualTypeOf<number | undefined>()
        },
      },
      () => {}
    )
  })

  it('asks only for the request-failed arm on a route declaring nothing', () => {
    matchError(vanilla, { 'request-failed': () => {} }, () => {})
  })
})
