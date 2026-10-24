import { request } from '@dphonys/test-utils/h3-app'
import type { H3Error } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  declarationFault,
  describeValue,
  developerFault,
} from '../../src/runtime/server/faults'
import { httpError, makeEventHandler } from '../../src/runtime/shared/h3'

// How a developer's mistake reaches the author, mounted on a real h3 app. A
// bare h3 app's body leaves `message` out, which Nitro's error handler adds;
// the message is read where an error hook reads it, and the Nitro body is the
// wire suites' to assert.

describe('a developer fault', () => {
  it('answers a plain 500 with no data, so no _tag', async () => {
    const handler = makeEventHandler(() => {
      throw developerFault('the handler did something it must not.')
    })

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ statusCode: 500, stack: [] })
  })

  it('names the mistake to an error hook, which sees it untouched', async () => {
    let seen: H3Error | undefined
    const handler = makeEventHandler(() => {
      throw developerFault('a mistake.')
    })

    await request(handler, '/api/test', {
      onError: (error) => void (seen = error),
    })

    expect(seen).toMatchObject({
      statusCode: 500,
      message: '[better-handler] a mistake.',
      data: undefined,
      fatal: false,
      unhandled: false,
    })
  })
})

describe('the h3 construction seam', () => {
  it('builds a handler that answers what its body returns', async () => {
    const handler = makeEventHandler(() => ({ ok: true }))

    const response = await request(handler, '/api/test')

    expect(await response.json()).toEqual({ ok: true })
  })

  it('sends an error’s status and data, and never a reason phrase', async () => {
    let seen: H3Error | undefined
    const handler = makeEventHandler(() => {
      throw httpError({
        status: 404,
        message: 'order-not-found',
        data: { _tag: 'order-not-found', id: 7 },
      })
    })

    const response = await request(handler, '/api/test', {
      onError: (error) => void (seen = error),
    })

    expect(response.status).toBe(404)
    expect(response.statusText).toBe('')
    expect(await response.json()).toEqual({
      statusCode: 404,
      stack: [],
      data: { _tag: 'order-not-found', id: 7 },
    })
    expect(seen).toMatchObject({
      message: 'order-not-found',
      statusMessage: undefined,
      fatal: false,
      unhandled: false,
    })
  })
})

describe('a declaration fault', () => {
  it('is a plain Error naming the mistake', () => {
    const fault = declarationFault('the route is misdeclared.')

    expect(fault).toBeInstanceOf(Error)
    expect(fault.constructor).toBe(Error)
    expect(fault.message).toBe('[better-handler] the route is misdeclared.')
  })
})

describe('describeValue', () => {
  class Order {
    readonly id = 1
  }

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    [[1, 2], 'an array'],
    [() => 1, 'a function'],
    [Order, 'a function'],
    [42, 'the primitive 42'],
    ['text', 'the primitive text'],
    [true, 'the primitive true'],
    [new Order(), 'an instance of Order'],
    [new Date(0), 'an instance of Date'],
    [
      new (class {
        readonly id = 1
      })(),
      'an instance of an anonymous class',
    ],
    [{}, 'an empty object'],
    [Object.create(null), 'an empty object'],
    [{ id: 1 }, 'a plain object'],
  ])('names %o as %s', (value, described) => {
    expect(describeValue(value)).toBe(described)
  })
})
