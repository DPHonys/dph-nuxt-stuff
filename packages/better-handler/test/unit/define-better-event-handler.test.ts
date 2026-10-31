import { request, requestReporting, untyped } from '@dphonys/test-utils/h3-app'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { Schema } from 'effect'
import type { EventHandler } from 'h3'
import { createError, getRouterParam } from 'h3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineBetterEventHandler,
  recognizeKnownError,
} from '../../src/runtime/server'
import { setDevChecks } from '../../src/runtime/server/dev-checks'

// The errors half of the composing wrapper, without a Nuxt boot: what a route
// declaring `errors` sends for whatever its body throws. Each request mounts
// the Handler on a real h3 app; `requestReporting` hands back the error h3's
// hook saw beside the response, which is what a Nitro error hook sees.

/** Mounted on h3's router, so `event.path` is the path a client asked. */
const ROUTE = '/api/orders/:id'

const orderErrors = {
  'order-not-found': {
    status: 404,
    schema: z.object({ id: z.number({ error: 'id must be a number' }) }),
  },
  'order-locked': { status: 409 },
}

// Effect error classes, as an app using Effect declares them.
// eslint-disable-next-line unicorn/throw-new-error -- Effect's error class builder, extended rather than thrown
class OrderMissing extends Schema.TaggedError<OrderMissing>()('OrderMissing', {
  id: Schema.Number,
}) {}

/** Effect keeps a `message` field as the instance's non-enumerable `message`. */
// eslint-disable-next-line unicorn/throw-new-error -- Effect's error class builder, extended rather than thrown
class OrderHeld extends Schema.TaggedError<OrderHeld>()('OrderHeld', {
  message: Schema.String,
}) {}

function answer(handler: EventHandler, path = '/api/orders/7') {
  return requestReporting(handler, path, { route: ROUTE })
}

/** A route over `orderErrors` that throws whatever `thrown` hands it. */
function throwing<Thrown>(thrown: () => Thrown): EventHandler {
  return defineBetterEventHandler({ errors: orderErrors }, () => {
    throw thrown()
  })
}

/** The h3 body's `data`, which is what the wire carries beside the status. */
async function dataOf(response: Response) {
  const body: { data?: unknown } = await response.json()

  return body.data
}

afterEach(() => {
  setDevChecks(false)
})

describe('a thrown value whose _tag the route declares', () => {
  it('goes out with the declared status, the tag as message and the Tagged error as data', async () => {
    const route = defineBetterEventHandler(
      { errors: orderErrors },
      (event, { fail }) => {
        throw fail('order-not-found', {
          id: Number(getRouterParam(event, 'id')),
        })
      }
    )

    const { response, thrown } = await answer(route)

    expect(response.status).toBe(404)
    expect(await dataOf(response)).toEqual({ _tag: 'order-not-found', id: 7 })

    // What a Nitro error hook sees: an ordinary h3 error, neither fatal nor
    // unhandled, so a production server keeps its `message` and `data`.
    expect(thrown).toMatchObject({
      statusCode: 404,
      message: 'order-not-found',
      data: { _tag: 'order-not-found', id: 7 },
      fatal: false,
      unhandled: false,
    })
    expect(thrown.statusMessage).toBeUndefined()
  })

  it('carries the tag alone for an error declared without a schema', async () => {
    const route = defineBetterEventHandler(
      { errors: orderErrors },
      (_event, { fail }) => {
        throw fail('order-locked')
      }
    )

    const { response } = await answer(route)

    expect(response.status).toBe(409)
    expect(await dataOf(response)).toEqual({ _tag: 'order-locked' })
  })

  it('answers a rejection as it answers a synchronous throw', async () => {
    const route = defineBetterEventHandler(
      { errors: orderErrors },
      async (_event, { fail }) => {
        await Promise.resolve()

        throw fail('order-locked')
      }
    )

    const { response } = await answer(route)

    expect(response.status).toBe(409)
    expect(await dataOf(response)).toEqual({ _tag: 'order-locked' })
  })

  it('recognises a foreign class instance by its _tag', async () => {
    class OrderLocked {
      readonly _tag = 'order-locked'

      constructor(readonly since: string) {}
    }

    const { response } = await answer(
      throwing(() => new OrderLocked('2026-10-24'))
    )

    expect(response.status).toBe(409)
    expect(await dataOf(response)).toEqual({
      _tag: 'order-locked',
      since: '2026-10-24',
    })
  })

  it('reads a _tag kept on the prototype, and only own enumerable fields', async () => {
    class OrderGone extends Error {
      declare readonly _tag: string

      constructor(readonly id: number) {
        super('the order is gone')
      }
    }

    Object.defineProperty(OrderGone.prototype, '_tag', {
      value: 'order-not-found',
    })

    const { response, thrown } = await answer(throwing(() => new OrderGone(7)))

    // `message`, `stack` and `name` are the instance's own or inherited but
    // never enumerable, so none of them is a field.
    expect(response.status).toBe(404)
    expect(await dataOf(response)).toEqual({ _tag: 'order-not-found', id: 7 })
    expect(thrown.message).toBe('order-not-found')
  })

  it('recognises a plain tagged object', async () => {
    const { response } = await answer(
      throwing(() => ({ _tag: 'order-locked', since: 'noon' }))
    )

    expect(response.status).toBe(409)
    expect(await dataOf(response)).toEqual({
      _tag: 'order-locked',
      since: 'noon',
    })
  })

  it('recognises an Effect tagged error class instance thrown as-is', async () => {
    const route = defineBetterEventHandler(
      {
        errors: {
          OrderMissing: {
            status: 404,
            schema: Schema.toStandardSchemaV1(OrderMissing),
          },
        },
      },
      () => {
        throw new OrderMissing({ id: 7 })
      }
    )

    const { response, thrown } = await answer(route)

    expect(response.status).toBe(404)
    expect(await dataOf(response)).toEqual({ _tag: 'OrderMissing', id: 7 })
    expect(thrown.message).toBe('OrderMissing')
  })

  it('takes the status from the declaration, never from the thrown value', async () => {
    // `status` and `statusCode` are ordinary field names, sent as fields.
    const { response } = await answer(
      throwing(() => ({ _tag: 'order-locked', status: 418, statusCode: 418 }))
    )

    expect(response.status).toBe(409)
    expect(await dataOf(response)).toEqual({
      _tag: 'order-locked',
      status: 418,
      statusCode: 418,
    })
  })

  it('leaves function-valued fields out, so a toJSON cannot replace data', async () => {
    const { response } = await answer(
      throwing(() => ({
        _tag: 'order-locked',
        since: 'noon',
        toJSON: () => ({ hijacked: true }),
        retry() {},
      }))
    )

    expect(await dataOf(response)).toEqual({
      _tag: 'order-locked',
      since: 'noon',
    })
  })

  it('sends a field named like an Error property as the field', async () => {
    const route = defineBetterEventHandler(
      {
        errors: {
          'order-odd': {
            status: 422,
            schema: z.object({ message: z.string(), stack: z.string() }),
          },
        },
      },
      (_event, { fail }) => {
        throw fail('order-odd', { message: 'the field', stack: 'a field too' })
      }
    )

    const { response, thrown } = await answer(route)

    expect(await dataOf(response)).toEqual({
      _tag: 'order-odd',
      message: 'the field',
      stack: 'a field too',
    })
    // The error's own message stays the tag.
    expect(thrown.message).toBe('order-odd')
  })

  it('is recognised by recognizeKnownError in the error hook', async () => {
    const route = defineBetterEventHandler(
      { errors: orderErrors },
      (_event, { fail }) => {
        throw fail('order-not-found', { id: 7 })
      }
    )

    const { thrown } = await answer(route)

    expect(recognizeKnownError(thrown)).toEqual({
      _tag: 'order-not-found',
      id: 7,
    })
  })
})

describe('everything else propagates untouched', () => {
  it('passes an untagged Error to h3 as it was thrown', async () => {
    const boom = new Error('boom')

    const { response, thrown } = await answer(throwing(() => boom))

    expect(response.status).toBe(500)
    expect(thrown.cause).toBe(boom)
    expect(thrown.unhandled).toBe(true)
    expect(recognizeKnownError(thrown)).toBeUndefined()
  })

  it('passes an h3 error the Handler raised itself, with its own data', async () => {
    const own = createError({ statusCode: 418, data: { reason: 'teapot' } })

    const { response, thrown } = await answer(throwing(() => own))

    expect(thrown).toBe(own)
    expect(response.status).toBe(418)
    expect(await dataOf(response)).toEqual({ reason: 'teapot' })
  })

  it.each([
    ['a non-string _tag', { _tag: 7 }],
    ['a string', 'order-locked'],
    ['an array', ['order-locked']],
  ])('passes %s untouched, development checks on or off', async (_, value) => {
    for (const enabled of [false, true]) {
      setDevChecks(enabled)

      const { response, thrown } = await answer(throwing(() => value))

      expect(response.status).toBe(500)
      expect(thrown.data).toBeUndefined()
      expect(thrown.message).not.toContain('[better-handler]')
    }
  })

  it('treats a _tag naming an Object.prototype key as undeclared', async () => {
    const tagged = { _tag: 'toString' }

    const { response, thrown } = await answer(throwing(() => tagged))

    expect(response.status).toBe(500)
    expect(thrown.cause).toBe(tagged)
  })

  it('passes the Fail helper’s own developer fault as it is', async () => {
    const route = defineBetterEventHandler(
      { errors: orderErrors },
      (_event, { fail }) => {
        throw untyped(fail)('order-unknown')
      }
    )

    const { response, thrown } = await answer(route)

    expect(response.status).toBe(500)
    expect(thrown.message).toBe(
      '[better-handler] fail("order-unknown") names no error this route declares. The route declares "order-not-found", "order-locked".'
    )
    expect(thrown.data).toBeUndefined()
  })
})

describe('the Handler context', () => {
  it('is a fresh object per request, holding the Fail helper', async () => {
    const seen: object[] = []
    const route = defineBetterEventHandler(
      { errors: orderErrors },
      (_event, context) => {
        seen.push(context)

        expect(Object.keys(context)).toEqual(['fail'])

        return { ok: true }
      }
    )

    for (let call = 0; call < 2; call += 1) {
      const response = await request(route, '/api/orders/7', { route: ROUTE })

      expect(await response.json()).toEqual({ ok: true })
    }

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
  })
})

describe('the development checks', () => {
  beforeEach(() => {
    setDevChecks(true)
  })

  it('refuse thrown fields the declared schema rejects, with a plain 500', async () => {
    const route = defineBetterEventHandler(
      { errors: orderErrors },
      (_event, { fail }) => {
        throw fail('order-not-found', untyped({ id: 'seven' }))
      }
    )

    const { response, thrown } = await answer(route)

    expect(response.status).toBe(500)
    expect(thrown.message).toBe(
      '[better-handler] cannot send the error: GET /api/orders/7 threw "order-not-found" with fields its declared schema rejects - id: id must be a number. ' +
        'Nothing checks the fields in production, so this route would send them as they are: fix the handler or the schema, or set `devChecks: false`.'
    )
    expect(thrown.data).toBeUndefined()
    expect(recognizeKnownError(thrown)).toBeUndefined()
  })

  it('send fields the schema accepts as they were thrown, not as it outputs them', async () => {
    const doubled = { _tag: 'order-doubled', id: 7 }
    const route = defineBetterEventHandler(
      {
        errors: {
          'order-doubled': {
            status: 409,
            schema: z.object({ id: z.number().transform((id) => id * 2) }),
          },
        },
      },
      () => {
        throw doubled
      }
    )

    const { response } = await answer(route)

    expect(response.status).toBe(409)
    expect(await dataOf(response)).toEqual({ _tag: 'order-doubled', id: 7 })
  })

  it('accept the input a transforming schema takes, which is what fail is typed by', async () => {
    const route = defineBetterEventHandler(
      {
        errors: {
          'order-dated': {
            status: 409,
            schema: z.object({ id: z.string().transform(Number) }),
          },
        },
      },
      (_event, { fail }) => {
        throw fail('order-dated', { id: '7' })
      }
    )

    const { response } = await answer(route)

    expect(response.status).toBe(409)
    expect(await dataOf(response)).toEqual({ _tag: 'order-dated', id: '7' })
  })

  it('hand the schema the whole Tagged error, which an Effect error class requires', async () => {
    const route = defineBetterEventHandler(
      {
        errors: {
          OrderMissing: {
            status: 404,
            schema: Schema.toStandardSchemaV1(OrderMissing),
          },
        },
      },
      () => {
        throw new OrderMissing({ id: 7 })
      }
    )

    const { response } = await answer(route)

    expect(response.status).toBe(404)
    expect(await dataOf(response)).toEqual({ _tag: 'OrderMissing', id: 7 })
  })

  it('catch an Effect error whose message field Effect keeps out of its own fields', async () => {
    // Not among the fields that go out, which the check reports, since the
    // schema requires it.
    const route = defineBetterEventHandler(
      {
        errors: {
          OrderHeld: {
            status: 409,
            schema: Schema.toStandardSchemaV1(OrderHeld),
          },
        },
      },
      () => {
        throw new OrderHeld({ message: 'held for review' })
      }
    )

    const { thrown } = await answer(route)

    expect(thrown.statusCode).toBe(500)
    expect(thrown.message).toContain(
      'threw "OrderHeld" with fields its declared schema rejects - message: '
    )
  })

  it('await an asynchronous schema, and name each issue by its path', async () => {
    const issues: StandardSchemaV1.Issue[] = [
      { message: 'must be listed', path: [{ key: 'items' }, 0] },
      { message: 'is incomplete' },
    ]
    const odd = { _tag: 'order-odd', items: [] }
    const rejecting: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({ issues }),
      },
    }

    const route = defineBetterEventHandler(
      { errors: { 'order-odd': { status: 422, schema: rejecting } } },
      () => {
        throw odd
      }
    )

    const { thrown } = await answer(route)

    expect(thrown.statusCode).toBe(500)
    expect(thrown.message).toContain(
      'threw "order-odd" with fields its declared schema rejects - items.0: must be listed; the fields: is incomplete. '
    )
  })

  it('check nothing for an error declared without a schema', async () => {
    const { response } = await answer(
      throwing(() => ({ _tag: 'order-locked', since: 'noon' }))
    )

    expect(response.status).toBe(409)
    expect(await dataOf(response)).toEqual({
      _tag: 'order-locked',
      since: 'noon',
    })
  })

  it('refuse a string _tag the route does not declare, naming the declared ones', async () => {
    const { response, thrown } = await answer(
      throwing(() => ({ _tag: 'order-paid' }))
    )

    expect(response.status).toBe(500)
    expect(thrown.message).toBe(
      '[better-handler] cannot send the error: GET /api/orders/7 threw a value tagged "order-paid", which this route does not declare - it declares "order-not-found", "order-locked". ' +
        'Nothing checks this in production, where the value propagates as it was thrown: declare the tag in `errors` or throw a declared one, or set `devChecks: false`.'
    )
    expect(thrown.data).toBeUndefined()
  })
})

describe('with the development checks off, as in production', () => {
  beforeEach(() => {
    setDevChecks(false)
  })

  it('sends thrown fields as they were thrown, whatever the schema says', async () => {
    const route = defineBetterEventHandler(
      { errors: orderErrors },
      (_event, { fail }) => {
        throw fail('order-not-found', untyped({ id: 'seven' }))
      }
    )

    const { response } = await answer(route)

    expect(response.status).toBe(404)
    expect(await dataOf(response)).toEqual({
      _tag: 'order-not-found',
      id: 'seven',
    })
  })

  it('lets a value with an undeclared _tag propagate untouched', async () => {
    const tagged = { _tag: 'order-paid', paidAt: 'noon' }

    const { response, thrown } = await answer(throwing(() => tagged))

    expect(response.status).toBe(500)
    expect(thrown.cause).toBe(tagged)
    expect(thrown.data).toBeUndefined()
  })
})
