import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { createError, H3Error } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createErrorContext,
  finalizeError,
  resolveDeclared,
} from '../../src/runtime/internals/server'
import {
  defineCheckedEventHandler,
  defineError,
} from '../../src/runtime/server'

const event = {} as H3Event
const schema = (
  validate: StandardSchemaV1<
    unknown,
    { amount: number }
  >['~standard']['validate']
): StandardSchemaV1<unknown, { amount: number }> => ({
  '~standard': { version: 1, vendor: 'test', validate },
})

describe('handler-local factories', () => {
  it.each([false, true])(
    'transforms flat output through group pick (async=%s)',
    async (asyncValidation) => {
      const group = defineError({
        conflict: {
          status: 409,
          payload: schema((value) => {
            const result = { value: { amount: Number(value) } }
            return asyncValidation ? Promise.resolve(result) : result
          }),
        },
        omitted: { status: 404 },
      })
      const declarations = [...group.pick('conflict')]
      const { errors } = createErrorContext(resolveDeclared(declarations))
      const error = errors.conflict!('42')
      expect(error).toBeInstanceOf(H3Error)
      expect(error.data).toEqual(
        asyncValidation
          ? undefined
          : { __knownError__: { tag: 'conflict', status: 409, amount: 42 } }
      )
      const handler = defineCheckedEventHandler(
        { errors: declarations },
        (_event, context) => {
          throw context.errors.conflict('42')
        }
      )
      await expect(handler(event)).rejects.toMatchObject({
        data: { __knownError__: { tag: 'conflict', status: 409, amount: 42 } },
      })
    }
  )

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
        expect(() =>
          (context.errors.notFound as (...args: unknown[]) => H3Error)({})
        ).toThrow('invalid arguments')
        expect(() =>
          (context.errors.empty as (...args: unknown[]) => H3Error)()
        ).toThrow('invalid arguments')
        expect(context.errors.empty({})).toBeInstanceOf(H3Error)
        return { ok: true }
      }
    )
    await expect(handler(event)).resolves.toEqual({ ok: true })
  })

  it.each([false, true])(
    'invalid schema input is an unmarked 500 (async=%s)',
    async (asyncValidation) => {
      const result = { issues: [{ message: 'bad input' }] }
      const bad = defineError('bad', {
        status: 409,
        payload: schema(() =>
          asyncValidation ? Promise.resolve(result) : result
        ),
      })
      const { errors } = createErrorContext(resolveDeclared([bad]))
      await expect(finalizeError(errors.bad!('secret'))).rejects.toMatchObject({
        statusCode: 500,
        data: undefined,
      })
    }
  )

  it('propagates validation exceptions and handles abandoned async factories', async () => {
    const exception = new Error('schema bug')
    const sync = defineError('bad', {
      status: 409,
      payload: schema(() => {
        throw exception
      }),
    })
    expect(() =>
      createErrorContext(resolveDeclared([sync])).errors.bad!(null)
    ).toThrow(exception)
    const asyncError = defineError('bad', {
      status: 409,
      payload: schema(async () => {
        throw exception
      }),
    })
    const { errors } = createErrorContext(resolveDeclared([asyncError]))
    errors.bad!(null)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(finalizeError(errors.bad!(null))).rejects.toBe(exception)
  })

  it.each([false, true])(
    'rejects non-object, reserved and invalid JSON output (async=%s)',
    async (asyncValidation) => {
      const cycle: { self?: unknown } = {}
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
        { nested: [Symbol('bad')] },
        { callback: () => 1 },
        cycle,
        new Date('2026-01-01T00:00:00.000Z'),
        { toJSON: () => ({ amount: 42 }) },
        Object.create({ toJSON: () => ({ amount: 42 }) }),
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
          payload: schema(() => {
            const result = { value: value as { amount: number } }
            return asyncValidation ? Promise.resolve(result) : result
          }),
        })
        const { errors } = createErrorContext(resolveDeclared([bad]))
        await expect(finalizeError(errors.bad!(null))).rejects.toMatchObject({
          statusCode: 500,
          message: 'Invalid declared error payload',
          data: undefined,
        })
      }
    }
  )

  it.each(['no-data', 'sync', 'async'] as const)(
    'preserves the original factory call stack after async finalization (%s)',
    async (kind) => {
      const declaration = defineError('conflict', {
        status: 409,
        ...(kind === 'no-data'
          ? {}
          : {
              payload: schema(() => {
                const result = { value: { amount: 42 } }
                return kind === 'async' ? Promise.resolve(result) : result
              }),
            }),
      })
      const { errors } = createErrorContext(resolveDeclared([declaration]))
      function originalFactoryCall() {
        return kind === 'no-data'
          ? errors.conflict!()
          : errors.conflict!({ amount: 42 })
      }
      const error = originalFactoryCall()
      const originalStack = error.stack
      expect(originalStack).toContain('originalFactoryCall')
      Object.assign(error, {
        stack: 'mutated stack',
        message: 'spoofed',
        statusCode: 503,
        statusMessage: 'unsafe',
        fatal: true,
        unhandled: true,
        data: { __knownError__: { tag: 'spoofed' } },
      })
      await Promise.resolve()
      await expect(finalizeError(error)).rejects.toMatchObject({
        stack: originalStack,
        message: 'conflict',
        statusCode: 409,
        statusMessage: undefined,
        fatal: false,
        unhandled: false,
        data: {
          __knownError__: {
            tag: 'conflict',
            status: 409,
            ...(kind === 'no-data' ? {} : { amount: 42 }),
          },
        },
      })
    }
  )

  it('snapshots validated output at the factory call', async () => {
    const group = defineError({
      dated: { status: 409, payload: z.object({ date: z.date() }) },
    })
    const { errors } = createErrorContext(
      resolveDeclared([...group.pick('dated')])
    )
    const date = new Date('2026-01-01T00:00:00.000Z')
    const error = errors.dated!({ date })
    date.setFullYear(2000)
    error.statusCode = 503
    error.data = { __knownError__: { tag: 'spoofed' } }
    await expect(finalizeError(error)).rejects.toMatchObject({
      statusCode: 409,
      data: {
        __knownError__: {
          tag: 'dated',
          status: 409,
          date: '2026-01-01T00:00:00.000Z',
        },
      },
    })
  })

  it('uses frozen prototype-safe maps and snapshots the validator', async () => {
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
    expect(errors[protoTag]!().statusCode).toBe(404)
    const noPayload = errors[protoTag]!()
    noPayload.statusCode = 503
    noPayload.data = { __knownError__: { tag: 'spoofed' } }
    await expect(finalizeError(noPayload)).rejects.toMatchObject({
      statusCode: 404,
      data: { __knownError__: { tag: '__proto__', status: 404 } },
    })
    expect(errors.constructor!().statusCode).toBe(409)
    Object.assign(data['~standard'], {
      validate: () => ({ value: { amount: 999 } }),
    })
    await expect(finalizeError(errors.conflict!('42'))).rejects.toMatchObject({
      data: { __knownError__: { amount: 42 } },
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
