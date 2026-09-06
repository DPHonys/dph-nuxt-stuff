/* eslint-disable ts/no-empty-object-type -- Exercise phantom empty PayloadArgs. */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createKnownError,
  resolveDeclared,
} from '../../src/runtime/internals/server'
import { defineError, payload } from '../../src/runtime/server'

describe('resolveDeclared', () => {
  const auth = defineError({
    unauthorized: { status: 401 },
    forbidden: { status: 403 },
  })

  it('resolves metadata in declaration order and deduplicates identical declarations', () => {
    expect(
      resolveDeclared([...auth, defineError('unauthorized', { status: 401 })])
    ).toEqual([
      {
        tag: 'unauthorized',
        status: 401,
        hasPayload: false,
        schema: undefined,
      },
      { tag: 'forbidden', status: 403, hasPayload: false, schema: undefined },
    ])
    const schema = z.object({ value: z.number() })
    const group = defineError({
      transformed: { status: 409, payload: schema },
      phantom: { status: 400, payload: payload<{}>() },
    })
    expect(resolveDeclared([...group.pick('transformed')])[0]).toEqual({
      tag: 'transformed',
      status: 409,
      hasPayload: true,
      schema,
    })
    expect(resolveDeclared([...group.pick('phantom')])[0]?.hasPayload).toBe(
      true
    )
  })

  it('rejects differing status, payload presence, and schema identity', () => {
    expect(() =>
      resolveDeclared([...auth, defineError('unauthorized', { status: 418 })])
    ).toThrow('conflicting declarations')
    expect(() =>
      resolveDeclared([
        ...auth,
        defineError('unauthorized', { status: 401, payload: payload<{}>() }),
      ])
    ).toThrow('conflicting declarations')
    const schema = z.object({ value: z.number() })
    const one = defineError('same', { status: 409, payload: schema })
    expect(
      resolveDeclared([
        one,
        defineError('same', { status: 409, payload: schema }),
      ])
    ).toHaveLength(1)
    expect(() =>
      resolveDeclared([
        one,
        defineError('same', {
          status: 409,
          payload: z.object({ value: z.number() }),
        }),
      ])
    ).toThrow('conflicting declarations')
  })

  it('rejects foreign values at the offending index before serving requests', () => {
    for (const foreign of [{}, null, undefined]) {
      expect(() => resolveDeclared([...auth, foreign as never])).toThrow(
        /errors\[2\] is not an error created by this copy/
      )
    }
  })
})

describe('createKnownError', () => {
  it('returns an unthrown marker without a reason phrase or fatal flag', () => {
    const error = createKnownError('forbidden', 403, { requiredRole: 'owner' })
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      statusCode: 403,
      message: 'forbidden',
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
    expect(error.statusMessage).toBeUndefined()
  })

  it('keeps reserved fields authoritative for type-only payloads', () => {
    expect(
      createKnownError('unauthorized', 401, { tag: 'spoofed', status: 200 })
        .data
    ).toEqual({ __knownError__: { tag: 'unauthorized', status: 401 } })
  })
})
