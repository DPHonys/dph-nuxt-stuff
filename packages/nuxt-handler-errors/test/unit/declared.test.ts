import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createKnownError,
  resolveDeclared,
} from '../../src/runtime/internals/server'
import { defineError } from '../../src/runtime/server'

describe('resolveDeclared', () => {
  const auth = defineError({
    unauthorized: { status: 401 },
    forbidden: { status: 403 },
  })

  it('resolves metadata in declaration order and deduplicates identical declarations', () => {
    expect(
      resolveDeclared([...auth, defineError('unauthorized', { status: 401 })])
    ).toEqual([
      { tag: 'unauthorized', status: 401, schema: undefined },
      { tag: 'forbidden', status: 403, schema: undefined },
    ])
    const schema = z.object({ value: z.number() })
    const group = defineError({
      transformed: { status: 409, payload: schema },
      bare: { status: 400 },
    })
    expect(resolveDeclared([...group.pick('transformed')])[0]).toEqual({
      tag: 'transformed',
      status: 409,
      schema,
    })
    expect(resolveDeclared([...group.pick('bare')])[0]).toEqual({
      tag: 'bare',
      status: 400,
      schema: undefined,
    })
  })

  it('rejects differing status, payload presence, and schema identity', () => {
    expect(() =>
      resolveDeclared([...auth, defineError('unauthorized', { status: 418 })])
    ).toThrow('conflicting declarations')
    expect(() =>
      resolveDeclared([
        ...auth,
        defineError('unauthorized', { status: 401, payload: z.object({}) }),
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
    for (const value of [{}, null, undefined]) {
      // SAFETY: deliberately not a value of this module's making - the
      // identity check under test is what refuses it.
      const foreign = value as never

      expect(() => resolveDeclared([...auth, foreign])).toThrow(
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

  it('keeps reserved fields authoritative over payload fields', () => {
    expect(
      createKnownError('unauthorized', 401, { tag: 'spoofed', status: 200 })
        .data
    ).toEqual({ __knownError__: { tag: 'unauthorized', status: 401 } })
  })
})
