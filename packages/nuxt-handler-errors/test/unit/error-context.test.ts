import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createError, H3Error } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createErrorContext,
  resolveDeclared,
} from '../../src/runtime/internals/server'
import {
  defineCheckedEventHandler,
  defineError,
} from '../../src/runtime/server'
import type { ErrorFactory } from '../../src/runtime/server/lib/error-context'
import { createTestEvent } from '../h3-event'

// The handlers under test never read the event - only the second argument,
// the factories, is exercised.
const event = createTestEvent()

const schema = (
  validate: StandardSchemaV1<
    unknown,
    { amount: number }
  >['~standard']['validate']
): StandardSchemaV1<unknown, { amount: number }> => ({
  '~standard': { version: 1, vendor: 'test', validate },
})

interface Cycle {
  self?: Cycle
}

/** What a lying schema may hand out at runtime: none of it a clean `{ amount }`. */
type Junk =
  | undefined
  | null
  | number
  | string
  | never[]
  | Cycle
  | Date
  | { tag: string }
  | { status: number }
  | { amount: bigint }
  | { amount: number; date: Date; callback: () => number; nested: object }
  | { toJSON: () => number | { tag: string } }

/**
 * A schema whose declared output is clean, so the definition compiles, and
 * whose runtime value is whatever `produce` says - the factory's own
 * validation of the output is what is under test. The lie is zod's own: a
 * preprocess that answers the junk, into a custom type that checks nothing.
 */
function lyingSchema(
  produce: () => Junk
): StandardSchemaV1<unknown, { amount: number }> {
  return z.preprocess(
    () => produce(),
    z.custom<{ amount: number }>(() => true)
  )
}

describe('handler-local factories', () => {
  it('transforms flat output through group pick', async () => {
    const group = defineError({
      conflict: {
        status: 409,
        payload: schema((value) => ({ value: { amount: Number(value) } })),
      },
      omitted: { status: 404 },
    })
    const declarations = [...group.pick('conflict')]
    const { errors } = createErrorContext(resolveDeclared(declarations))
    const error = errors.conflict!('42')
    expect(error).toBeInstanceOf(H3Error)
    expect(error.data).toEqual({
      __knownError__: { tag: 'conflict', status: 409, amount: 42 },
    })
    const handler = defineCheckedEventHandler(
      { errors: declarations },
      (_event, context) => {
        throw context.errors.conflict('42')
      }
    )
    await expect(handler(event)).rejects.toMatchObject({
      data: { __knownError__: { tag: 'conflict', status: 409, amount: 42 } },
    })
  })

  it('enforces no-payload and schema arity, including empty schema input', async () => {
    const declarations = [
      ...defineError({
        notFound: { status: 404 },
        empty: { status: 400, payload: z.object({}) },
      }),
    ]
    const handler = defineCheckedEventHandler(
      { errors: declarations },
      (_event, context) => {
        expect(context.errors.notFound().data).toEqual({
          __knownError__: { tag: 'notFound', status: 404 },
        })
        // Widened to the factories' runtime face, where any argument list is
        // callable - the arity check under test is what refuses them.
        const looseNotFound: ErrorFactory = context.errors.notFound
        const looseEmpty: ErrorFactory = context.errors.empty
        expect(() => looseNotFound({})).toThrow('invalid arguments')
        expect(() => looseEmpty()).toThrow('invalid arguments')
        expect(context.errors.empty({})).toBeInstanceOf(H3Error)
        return { ok: true }
      }
    )
    await expect(handler(event)).resolves.toEqual({ ok: true })
  })

  it('invalid schema input is an unmarked 500', () => {
    const bad = defineError('bad', {
      status: 409,
      payload: schema(() => ({ issues: [{ message: 'bad input' }] })),
    })
    const { errors } = createErrorContext(resolveDeclared([bad]))
    expect(errors.bad!('secret')).toMatchObject({
      statusCode: 500,
      data: undefined,
    })
  })

  it('propagates validation exceptions', () => {
    const exception = new Error('schema bug')
    const bad = defineError('bad', {
      status: 409,
      payload: schema(() => {
        throw exception
      }),
    })
    expect(() =>
      createErrorContext(resolveDeclared([bad])).errors.bad!(null)
    ).toThrow(exception)
  })

  it('rejects an asynchronous schema at the factory call', () => {
    const asynchronous = defineError('slow', {
      status: 409,
      payload: schema(async () => {
        throw new Error('never observed as unhandled')
      }),
    })
    const { errors } = createErrorContext(resolveDeclared([asynchronous]))
    expect(() => errors.slow!(null)).toThrow(
      '[nuxt-handler-errors] the payload schema for slow validates asynchronously'
    )
  })

  it('rejects non-object, reserved and unserializable output', () => {
    const cycle: Cycle = {}
    cycle.self = cycle
    for (const value of [
      undefined,
      null,
      42,
      'text',
      [],
      { tag: 'spoofed' },
      { status: 200 },
      { amount: 1n },
      cycle,
      new Date('2026-01-01T00:00:00.000Z'),
      { toJSON: () => 42 },
      { toJSON: () => ({ tag: 'spoofed' }) },
      {
        toJSON() {
          throw new Error('secret')
        },
      },
    ]) {
      const bad = defineError('bad', {
        status: 409,
        payload: lyingSchema(() => value),
      })
      const { errors } = createErrorContext(resolveDeclared([bad]))
      expect(errors.bad!(null)).toMatchObject({
        statusCode: 500,
        message: 'Invalid declared error payload',
        data: undefined,
      })
    }
  })

  it('snapshots validated output at the factory call, as the wire would', () => {
    // A lying schema: the declared output type is clean, the runtime value
    // carries what JSON drops or settles - a Date, a callback, a nested toJSON.
    const date = new Date('2026-01-01T00:00:00.000Z')
    const dated = defineError('dated', {
      status: 409,
      payload: lyingSchema(() => ({
        amount: 1,
        date,
        callback: () => 1,
        nested: { toJSON: () => ({ amount: 42 }) },
      })),
    })
    const { errors } = createErrorContext(resolveDeclared([dated]))
    const error = errors.dated!(null)
    date.setFullYear(2000)
    expect(error.data).toEqual({
      __knownError__: {
        tag: 'dated',
        status: 409,
        amount: 1,
        date: '2026-01-01T00:00:00.000Z',
        nested: { amount: 42 },
      },
    })
  })

  it('uses frozen prototype-safe maps and snapshots the validator', () => {
    const data = schema((value) => ({ value: { amount: Number(value) } }))
    const group = defineError({
      ['__proto__']: { status: 404 },
      constructor: { status: 409 },
      conflict: { status: 409, payload: data },
    })
    const { errors } = createErrorContext(resolveDeclared([...group]))
    expect(Object.getPrototypeOf(errors)).toBeNull()
    expect(Object.isFrozen(errors)).toBe(true)
    const protoTag = '__proto__'
    expect(Object.isFrozen(errors[protoTag])).toBe(true)
    expect(errors[protoTag]!()).toMatchObject({
      statusCode: 404,
      data: { __knownError__: { tag: '__proto__', status: 404 } },
    })
    expect(errors.constructor!().statusCode).toBe(409)
    Object.assign(data['~standard'], {
      validate: () => ({ value: { amount: 999 } }),
    })
    expect(errors.conflict!('42').data).toMatchObject({
      __knownError__: { amount: 42 },
    })
  })

  it.each([
    new Error('general'),
    createError({ statusCode: 403 }),
    null,
    'plain',
  ])('preserves unrelated thrown values: %s', async (error) => {
    const handler = defineCheckedEventHandler({ errors: [] }, () => {
      throw error
    })
    await expect(handler(event)).rejects.toBe(error)
  })
})
