import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { createError, H3Error } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createErrorContext,
  finalizeError,
} from '../../src/runtime/internals/server'
import { defineCheckedEventHandler } from '../../src/runtime/server'

const event = {} as H3Event
const schema = (
  validate: StandardSchemaV1<unknown, number>['~standard']['validate']
): StandardSchemaV1<unknown, number> => ({
  '~standard': { version: 1, vendor: 'test', validate },
})

describe('handler-local errors', () => {
  it('returns synchronous throwable H3Errors with sync transformed nested data', async () => {
    const definitions = {
      conflict: { status: 409, data: z.string().transform(Number) },
    }
    const { errors } = createErrorContext(definitions)
    expect(errors.conflict.tag).toBe('conflict')
    expect(errors.conflict.status).toBe(409)
    const error = errors.conflict('42')
    expect(error).toBeInstanceOf(H3Error)
    expect(error.data).toEqual({
      __knownError__: { tag: 'conflict', status: 409, data: 42 },
    })
    const handler = defineCheckedEventHandler(
      { errors: definitions },
      (_event, context) => {
        throw context.errors.conflict('42')
      }
    )
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 409,
      data: error.data,
    })
  })

  it('finalizes async transforms before marking thrown errors', async () => {
    const definitions = {
      conflict: {
        status: 409,
        data: schema(async (value) => ({ value: Number(value) })),
      },
    }
    const { errors } = createErrorContext(definitions)
    const error = errors.conflict('42')
    expect(error).toBeInstanceOf(H3Error)
    expect(error.data).toBeUndefined()
    const handler = defineCheckedEventHandler(
      { errors: definitions },
      async (_event, context) => {
        await Promise.resolve()
        throw context.errors.conflict('42')
      }
    )
    await expect(handler(event)).rejects.toMatchObject({
      data: { __knownError__: { tag: 'conflict', status: 409, data: 42 } },
    })
  })

  it('supports no-data errors and successful handlers without fail', async () => {
    const handler = defineCheckedEventHandler(
      { errors: { notFound: { status: 404 } } },
      (_event, context) => {
        expect('fail' in context).toBe(false)
        expect(context.errors.notFound().data).toEqual({
          __knownError__: { tag: 'notFound', status: 404 },
        })
        expect(() =>
          (context.errors.notFound as (...args: unknown[]) => H3Error)({})
        ).toThrow('invalid arguments')
        return { ok: true }
      }
    )
    await expect(handler(event)).resolves.toEqual({ ok: true })
  })

  it.each([false, true])(
    'invalid data is an unmarked 500 (async=%s)',
    async (asyncValidation) => {
      const result = { issues: [{ message: 'bad input' }] }
      const { errors } = createErrorContext({
        bad: {
          status: 409,
          data: schema(() =>
            asyncValidation ? Promise.resolve(result) : result
          ),
        },
      })
      await expect(finalizeError(errors.bad('secret'))).rejects.toMatchObject({
        statusCode: 500,
        data: undefined,
      })
    }
  )

  it('propagates schema exceptions and handles abandoned async factories', async () => {
    const exception = new Error('schema bug')
    const sync = createErrorContext({
      bad: {
        status: 409,
        data: schema(() => {
          throw exception
        }),
      },
    })
    expect(() => sync.errors.bad(null)).toThrow(exception)
    const asyncContext = createErrorContext({
      bad: {
        status: 409,
        data: schema(async () => {
          throw exception
        }),
      },
    })
    asyncContext.errors.bad(null)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(finalizeError(asyncContext.errors.bad(null))).rejects.toBe(
      exception
    )
  })

  it.each([false, true])(
    'rejects invalid outgoing JSON (async=%s)',
    async (asyncValidation) => {
      const cycle: { self?: unknown } = {}
      cycle.self = cycle
      for (const value of [
        undefined,
        { amount: 1n },
        { nested: [Symbol('bad')] },
        { callback: () => 1 },
        cycle,
        {
          toJSON() {
            throw new Error('secret')
          },
        },
      ]) {
        const { errors } = createErrorContext({
          bad: {
            status: 409,
            data: schema(() => {
              // Simulate JS callers or a schema lying about its output type.
              const result = { value: value as number }
              return asyncValidation ? Promise.resolve(result) : result
            }),
          },
        })
        await expect(finalizeError(errors.bad(null))).rejects.toMatchObject({
          statusCode: 500,
          message: 'Invalid declared error data',
          data: undefined,
        })
      }
    }
  )

  it('accepts numeric-looking runtime string keys and snapshots JSON output', () => {
    const { errors } = createErrorContext({
      '123': {
        status: 409,
        data: z.object({ date: z.date(), amount: z.number().optional() }),
      },
    })
    const date = new Date('2026-01-01T00:00:00.000Z')
    const error = errors['123']({ date })
    date.setFullYear(2000)
    expect(error.data).toEqual({
      __knownError__: {
        tag: '123',
        status: 409,
        data: { date: '2026-01-01T00:00:00.000Z' },
      },
    })
  })

  it.each([
    null,
    [],
    { bad: null },
    { bad: { status: 200 } },
    { bad: { status: 404.5 } },
    { bad: { status: 404, payload: {} } },
    { bad: { status: 404, data: undefined } },
    { [Symbol('tag')]: { status: 404 } },
    {
      bad: {
        status: 404,
        data: { '~standard': { version: 2, vendor: 'test', validate() {} } },
      },
    },
    {
      bad: {
        status: 404,
        data: { '~standard': { version: 1, vendor: 'test' } },
      },
    },
  ])('rejects malformed declarations: %j', (errors) => {
    expect(() => createErrorContext(errors as never)).toThrow(TypeError)
  })

  it('does not invoke declaration getters or accept inherited declarations', () => {
    expect(() =>
      createErrorContext({
        get bad() {
          throw new Error('getter invoked')
        },
      } as never)
    ).toThrow('invalid error definition')
    expect(() =>
      createErrorContext(Object.create({ inherited: { status: 404 } }))
    ).toThrow('definition record')
  })

  it('uses frozen prototype-safe maps and snapshots status and validator', async () => {
    const protoTag = '__proto__'
    const definitions = {
      ['__proto__']: { status: 404 },
      constructor: { status: 409 },
    }
    const context = createErrorContext(definitions)
    definitions[protoTag].status = 500
    expect(Object.getPrototypeOf(context.errors)).toBeNull()
    expect(Object.isFrozen(context.errors)).toBe(true)
    expect(Object.isFrozen(context.errors[protoTag])).toBe(true)
    const error = context.errors[protoTag]()
    error.statusCode = 503
    error.data = { __knownError__: { tag: 'spoofed', status: 503 } }
    await expect(finalizeError(error)).rejects.toMatchObject({
      statusCode: 404,
      data: { __knownError__: { tag: '__proto__', status: 404 } },
    })
    expect(context.errors.constructor().statusCode).toBe(409)
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
    const data = schema((value) => ({ value: Number(value) }))
    const { errors } = createErrorContext({ conflict: { status: 409, data } })
    Object.assign(data['~standard'], { validate: () => ({ value: 999 }) })
    await expect(finalizeError(errors.conflict('42'))).rejects.toMatchObject({
      data: { __knownError__: { data: 42 } },
    })
  })

  it('keeps reserved names inside nested data, not on the variant', async () => {
    const { errors } = createErrorContext({
      conflict: {
        status: 409,
        data: z.object({ tag: z.string(), status: z.number() }),
      },
    })
    await expect(
      finalizeError(errors.conflict({ tag: 'spoofed', status: 200 }))
    ).rejects.toMatchObject({
      data: {
        __knownError__: {
          tag: 'conflict',
          status: 409,
          data: { tag: 'spoofed', status: 200 },
        },
      },
    })
  })

  it.each([
    new Error('general'),
    createError({ statusCode: 403 }),
    null,
    'plain',
  ])('preserves unrelated thrown values: %s', async (error) => {
    const handler = defineCheckedEventHandler({ errors: {} }, () => {
      throw error
    })
    await expect(handler(event)).rejects.toBe(error)
  })
})
