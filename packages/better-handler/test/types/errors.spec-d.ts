import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineError } from '../../src/runtime/server'
import type {
  ErrorDeclarations,
  ErrorEntry,
  Fail,
  FailedError,
} from '../../src/runtime/types'

const orderRef = z.object({ id: z.number() })

const orderNotFound = defineError('order-not-found', {
  status: 404,
  schema: orderRef,
})
const orderLocked = defineError('order-locked', { status: 409 })

const declared = {
  ...orderNotFound,
  ...orderLocked,
  'order-paid': { status: 409, schema: z.object({ paidAt: z.string() }) },
} satisfies ErrorDeclarations

declare const fail: Fail<typeof declared>

const tagged = {
  ...defineError('order-missing', {
    status: 404,
    schema: z.object({ _tag: z.literal('order-missing'), id: z.number() }),
  }),
}
declare const failTagged: Fail<typeof tagged>

const colliding = {
  ...defineError('order-message', {
    status: 422,
    schema: z.object({ message: z.number(), cause: z.boolean() }),
  }),
}
declare const failColliding: Fail<typeof colliding>

const either = {
  'order-held': {
    status: 409,
    schema: z.union([
      z.object({ by: z.literal('user'), userId: z.string() }),
      z.object({ by: z.literal('system') }),
    ]),
  },
} satisfies ErrorDeclarations
declare const failEither: Fail<typeof either>

declare const failPicked: Fail<Pick<typeof declared, 'order-locked'>>

describe('defineError', () => {
  it('returns a one-key map of the tag to its entry', () => {
    expectTypeOf(orderNotFound).toEqualTypeOf<{
      readonly 'order-not-found': {
        readonly status: 404
        readonly schema: typeof orderRef
      }
    }>()
    expectTypeOf(orderLocked).toEqualTypeOf<{
      readonly 'order-locked': { readonly status: 409 }
    }>()
  })

  it('is an errors map itself, so it is declared as one', () => {
    expectTypeOf(orderNotFound).toExtend<ErrorDeclarations>()
    expectTypeOf(orderNotFound['order-not-found']).toExtend<ErrorEntry>()
  })

  it('accepts a schema whose _tag literal is the tag', () => {
    expectTypeOf(tagged).toHaveProperty('order-missing')
  })

  it('accepts both ends of the status range, and a status it cannot know', () => {
    // Plain `number` is what a computed status widens to; only a literal can
    // be held to the range here, and the declaration-time throw holds the rest.
    const status: number = 404
    const range = {
      ...defineError('too-early', { status: 400 }),
      ...defineError('too-late', { status: 599 }),
      ...defineError('order-computed', { status }),
    } satisfies ErrorDeclarations

    expectTypeOf<keyof typeof range>().toEqualTypeOf<
      'too-early' | 'too-late' | 'order-computed'
    >()
    expectTypeOf(range['order-computed'].status).toEqualTypeOf<number>()
  })

  it('accepts a schema whose _tag is only a string', () => {
    const loose = defineError('order-loose', {
      status: 404,
      schema: z.object({ _tag: z.string() }),
    })

    expectTypeOf(loose).toHaveProperty('order-loose')
  })
})

describe('spread reuse', () => {
  it('keeps every spread key and its entry', () => {
    expectTypeOf<keyof typeof declared>().toEqualTypeOf<
      'order-not-found' | 'order-locked' | 'order-paid'
    >()
    expectTypeOf(declared['order-not-found'].schema).toEqualTypeOf(orderRef)
  })

  it('reaches every spread tag through the Fail helper', () => {
    expectTypeOf(fail)
      .parameter(0)
      .toEqualTypeOf<'order-not-found' | 'order-locked' | 'order-paid'>()
  })
})

describe('the Fail helper', () => {
  it('takes the schema output as the fields of a schema-bearing tag', () => {
    expectTypeOf(fail<'order-not-found'>).parameters.toEqualTypeOf<
      [tag: 'order-not-found', value: { id: number }]
    >()
  })

  it('takes the tag alone for a tag declared without a schema', () => {
    expectTypeOf(fail<'order-locked'>).parameters.toEqualTypeOf<
      [tag: 'order-locked']
    >()
  })

  it('returns an Error carrying the tag and the fields', () => {
    const failed = fail('order-not-found', { id: 7 })

    expectTypeOf(failed).toExtend<Error>()
    expectTypeOf(failed._tag).toEqualTypeOf<'order-not-found'>()
    expectTypeOf(failed.id).toEqualTypeOf<number>()
    expectTypeOf(failed).toEqualTypeOf<
      FailedError<'order-not-found', { id: number }>
    >()
  })

  it('returns a bare tagged Error for a tag without a schema', () => {
    const failed = fail('order-locked')

    expectTypeOf(failed._tag).toEqualTypeOf<'order-locked'>()
    expectTypeOf(failed.message).toEqualTypeOf<string>()
  })

  it('leaves _tag out of the fields when the schema carries it', () => {
    expectTypeOf(failTagged<'order-missing'>)
      .parameter(1)
      .toEqualTypeOf<{
        id: number
      }>()
  })

  it('makes a field named like an Error property the field', () => {
    expectTypeOf(colliding).toExtend<ErrorDeclarations>()

    const failed = failColliding('order-message', { message: 1, cause: true })

    expectTypeOf(failed.message).toEqualTypeOf<number>()
    expectTypeOf(failed.cause).toEqualTypeOf<boolean>()
  })

  it('keeps each member of a union output its own fields', () => {
    expectTypeOf(either).toExtend<ErrorDeclarations>()
    expectTypeOf(failEither<'order-held'>)
      .parameter(1)
      .toEqualTypeOf<{ by: 'user'; userId: string } | { by: 'system' }>()
  })
})

describe('Pick narrowing', () => {
  it('narrows the Fail helper to the picked tags', () => {
    expectTypeOf(failPicked).parameter(0).toEqualTypeOf<'order-locked'>()
  })
})
