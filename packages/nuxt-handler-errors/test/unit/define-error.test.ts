import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineCheckedEventHandler,
  defineError,
} from '../../src/runtime/server'
import { factory } from '../error-factory'
import { createTestEvent } from '../h3-event'

// The handlers under test never read the event - only the second argument,
// the factories, is exercised.
const event = createTestEvent()

describe('defined errors at runtime', () => {
  const auth = defineError({
    unauthorized: { status: 401 },
    forbidden: {
      status: 403,
      payload: z.object({ requiredRole: z.enum(['admin', 'owner']) }),
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
    const standard: StandardSchemaV1<unknown, { amount: number }>['~standard'] =
      {
        version: 1,
        vendor: 'test',
        validate: (input) => ({ value: { amount: Number(input) } }),
      }
    const callable: StandardSchemaV1<unknown, { amount: number }> =
      Object.assign(() => {}, { '~standard': standard })
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
    // A JavaScript caller's mistakes, deliberately outside the type: a bare
    // object where an error value belongs, and a definition record where an
    // errors array belongs. The declaration guard under test rejects both.
    const foreign = {}
    const inline = { bad: { status: 404 } }

    expect(() =>
      // @ts-expect-error a bare object is not an error value
      defineCheckedEventHandler({ errors: [...auth, foreign] }, () => null)
    ).toThrow(/errors\[2\]/)
    expect(() =>
      // @ts-expect-error a definition record is not an errors array
      defineCheckedEventHandler({ errors: inline }, () => null)
    ).toThrow(TypeError)
  })

  it.each([
    null,
    [],
    { bad: null },
    { bad: { status: 200 } },
    { bad: { status: 404.5 } },
    { bad: { status: 404, data: {} } },
    { bad: { status: 404, payload: () => {} } },
    { bad: { status: 404, payload: {} } },
    { userNotFound: { status: 404 } },
    { 'user--gone': { status: 404 } },
    { 'user-': { status: 404 } },
    { '-user': { status: 404 } },
    { 'a-1b': { status: 404 } },
    { '404': { status: 404 } },
    { '': { status: 404 } },
    { $ok_1: { status: 404 } },
    { Δ: { status: 404 } },
    {
      bad: {
        status: 404,
        payload: { '~standard': { version: 1, vendor: 'test' } },
      },
    },
  ])('rejects malformed definitions: %j', (definitions) => {
    // Each row is a JavaScript caller's malformed record, deliberately
    // outside the type; the guard under test rejects it before reading it as
    // definitions.
    // @ts-expect-error a malformed definition record
    expect(() => defineError(definitions)).toThrow(TypeError)
  })

  it('rejects tags that are not kebab-case, on both forms', () => {
    // Tags the `ValidTag` guard refuses at compile time, handed in as a
    // JavaScript caller would; the runtime guard under test refuses them the
    // same way.
    const camelRecord = { userNotFound: { status: 404 } }

    expect(() =>
      // @ts-expect-error a camelCase tag is not kebab-case
      defineError('userNotFound', { status: 404 })
    ).toThrow(
      'error tag must be kebab-case, such as user-not-found: userNotFound'
    )
    // @ts-expect-error a camelCase tag is not kebab-case, record form
    expect(() => defineError(camelRecord)).toThrow(
      'error tag must be kebab-case, such as user-not-found: userNotFound'
    )
    expect(() => defineError('user-not-found', { status: 404 })).not.toThrow()
    expect(() => defineError('v2', { status: 404 })).not.toThrow()
  })

  it('names factories in camelCase from kebab-case tags', async () => {
    const handler = defineCheckedEventHandler(
      {
        errors: [
          ...defineError({
            'user-not-found': { status: 404 },
            'rate-limited-v2': { status: 429 },
            single: { status: 410 },
          }),
        ],
      },
      (_event, { errors }) => {
        expect(Object.keys(errors)).toEqual([
          'userNotFound',
          'rateLimitedV2',
          'single',
        ])
        throw errors.rateLimitedV2()
      }
    )
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 429,
      data: { __knownError__: { tag: 'rate-limited-v2', status: 429 } },
    })
  })

  it('makes payload-less factories zero-argument, and rejects any argument', async () => {
    const empty = defineError('empty', { status: 400 })
    const handler = defineCheckedEventHandler(
      { errors: [empty] },
      (_event, { errors }) => {
        throw errors.empty()
      }
    )
    await expect(handler(event)).rejects.toMatchObject({
      data: { __knownError__: { tag: 'empty', status: 400 } },
    })
    const withArgument = defineCheckedEventHandler(
      { errors: [empty] },
      (_event, { errors }) => {
        throw factory(errors, 'empty')({})
      }
    )
    await expect(withArgument(event)).rejects.toThrow(
      '[nuxt-handler-errors] invalid arguments for empty'
    )
  })

  it('answers an unmarked 500 when a schema rejects the payload', async () => {
    const rejected = defineCheckedEventHandler(
      { errors: [...auth] },
      (_event, { errors }) => {
        // A payload the schema refuses, deliberately outside its input type;
        // the factory validates it at runtime, which is the claim.
        // @ts-expect-error a role the schema's enum does not name
        throw errors.forbidden({ requiredRole: 42 })
      }
    )
    await expect(rejected(event)).rejects.toMatchObject({
      statusCode: 500,
      message: 'Invalid declared error payload',
    })
  })
})
