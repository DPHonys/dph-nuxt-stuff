/* eslint-disable ts/no-empty-object-type -- Exercise phantom empty PayloadArgs. */
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  defineCheckedEventHandler,
  defineError,
  payload,
} from '../../src/runtime/server'

const event = {} as H3Event

describe('defined errors at runtime', () => {
  const auth = defineError({
    unauthorized: { status: 401 },
    forbidden: {
      status: 403,
      payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
    },
  })
  const maintenance = defineError('maintenance', { status: 503 })

  it('throws flat marked errors from composed singles and groups', async () => {
    const handler = defineCheckedEventHandler(
      { errors: [...auth, maintenance] },
      (_event, { errors }) => {
        throw errors.forbidden({ requiredRole: 'owner' })
      }
    )
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 403,
      message: 'forbidden',
      statusMessage: undefined,
      fatal: false,
      unhandled: false,
      data: {
        __knownError__: {
          tag: 'forbidden',
          status: 403,
          requiredRole: 'owner',
        },
      },
    })
  })

  it('accepts callable Standard Schema implementations', async () => {
    const callable: StandardSchemaV1<unknown, { amount: number }> =
      Object.assign(() => {}, {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (input: unknown) => ({ value: { amount: Number(input) } }),
        },
      })
    const conflict = defineError('conflict', { status: 409, payload: callable })
    const handler = defineCheckedEventHandler(
      { errors: [conflict] },
      (_event, { errors }) => {
        throw errors.conflict('42')
      }
    )
    await expect(handler(event)).rejects.toMatchObject({
      data: { __knownError__: { tag: 'conflict', status: 409, amount: 42 } },
    })
  })

  it('narrows runtime factories to picked tags', async () => {
    const picked = auth.pick('unauthorized', 'unauthorized')
    expect(picked).toHaveLength(1)
    expect(auth.pick()).toHaveLength(0)
    const handler = defineCheckedEventHandler(
      { errors: [...picked] },
      (_event, { errors }) => {
        expect(Object.keys(errors)).toEqual(['unauthorized'])
        throw errors.unauthorized()
      }
    )
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('deduplicates identical declarations', async () => {
    const handler = defineCheckedEventHandler(
      { errors: [...auth, defineError('unauthorized', { status: 401 })] },
      (_event, { errors }) => {
        throw errors.unauthorized()
      }
    )
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects foreign declarations and inline records at declaration time', () => {
    expect(() =>
      defineCheckedEventHandler({ errors: [...auth, {} as never] }, () => null)
    ).toThrow(/errors\[2\]/)
    expect(() =>
      defineCheckedEventHandler(
        { errors: { bad: { status: 404 } } as never },
        () => null
      )
    ).toThrow(TypeError)
  })

  it.each([
    null,
    [],
    { bad: null },
    { bad: { status: 200 } },
    { bad: { status: 404.5 } },
    { bad: { status: 404, data: {} } },
    { bad: { status: 404, payload: undefined } },
    { bad: { status: 404, payload: () => {} } },
    { [Symbol('tag')]: { status: 404 } },
    {
      bad: {
        status: 404,
        payload: { '~standard': { version: 2, vendor: 'test', validate() {} } },
      },
    },
    {
      bad: {
        status: 404,
        payload: { '~standard': { version: 1, vendor: 'test' } },
      },
    },
  ])('rejects malformed definitions: %j', (definitions) => {
    expect(() => defineError(definitions as never)).toThrow(TypeError)
  })

  it('does not invoke declaration getters or accept inherited declarations', () => {
    expect(() =>
      defineError({
        get bad() {
          throw new Error('getter invoked')
        },
      } as never)
    ).toThrow('invalid error definition')
    expect(() =>
      defineError('bad', {
        get status() {
          throw new Error('getter invoked')
        },
      } as never)
    ).toThrow('invalid error definition')
    expect(() =>
      defineError(Object.create({ inherited: { status: 404 } }) as never)
    ).toThrow('invalid error definitions')
  })

  it('keeps phantom payloads type-only, with empty payloads callable without arguments', async () => {
    const empty = defineError('empty', { status: 400, payload: payload<{}>() })
    const handler = defineCheckedEventHandler(
      { errors: [empty] },
      (_event, { errors }) => {
        throw errors.empty()
      }
    )
    await expect(handler(event)).rejects.toMatchObject({
      data: { __knownError__: { tag: 'empty', status: 400 } },
    })
    const unchecked = defineCheckedEventHandler(
      { errors: [...auth] },
      (_event, { errors }) => {
        throw errors.forbidden({ requiredRole: 42 } as never)
      }
    )
    await expect(unchecked(event)).rejects.toMatchObject({
      data: { __knownError__: { requiredRole: 42 } },
    })
  })
})
