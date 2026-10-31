import { untyped } from '@dphonys/test-utils/h3-app'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineError } from '../../src/runtime/server'
import { resolveErrors } from '../../src/runtime/server/errors/declaration'

// Declaration-time behaviour, without a Nuxt boot: what `defineError` returns,
// and what a misdeclared error throws while its module is evaluated. A
// JavaScript caller is simulated with `untyped`, since the compile guards
// refuse every case below before it could run.

const orderRef = z.object({ id: z.number() })

/** A Standard Schema that is a function, as arktype's are. */
function callableSchema(): StandardSchemaV1 {
  const standard: StandardSchemaV1.Props = {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value }),
  }

  return Object.assign(() => {}, { '~standard': standard })
}

describe('defineError', () => {
  it('returns a one-key map of the tag to its entry', () => {
    expect(
      defineError('order-not-found', { status: 404, schema: orderRef })
    ).toEqual({ 'order-not-found': { status: 404, schema: orderRef } })
    expect(defineError('order-locked', { status: 409 })).toEqual({
      'order-locked': { status: 409 },
    })
  })

  it('hands the schema back as the same instance', () => {
    const declared = defineError('order-not-found', {
      status: 404,
      schema: orderRef,
    })

    expect(declared['order-not-found'].schema).toBe(orderRef)
  })

  it('spreads beside other declarations, a later key winning', () => {
    const declared = {
      ...defineError('order-not-found', { status: 404, schema: orderRef }),
      ...defineError('order-locked', { status: 409 }),
      'order-locked': { status: 423 },
    }

    expect(declared).toEqual({
      'order-not-found': { status: 404, schema: orderRef },
      'order-locked': { status: 423 },
    })
  })

  it('takes `__proto__` and `constructor` as ordinary tags', () => {
    const proto = defineError('__proto__', { status: 400 })
    const spread = { ...proto, ...defineError('constructor', { status: 401 }) }

    expect(Object.keys(spread)).toEqual(['__proto__', 'constructor'])
    expect(Object.getPrototypeOf(spread)).toBe(Object.prototype)
  })

  it('accepts a callable Standard Schema and both ends of the status range', () => {
    const schema = callableSchema()

    expect(defineError('too-early', { status: 400, schema })).toEqual({
      'too-early': { status: 400, schema },
    })
    expect(defineError('too-late', { status: 599 })).toEqual({
      'too-late': { status: 599 },
    })
  })
})

describe('defineError refuses a misdeclared error', () => {
  it.each(['validation-failed', 'request-failed'])(
    'refuses the reserved tag %s',
    (tag) => {
      expect(() => defineError(untyped(tag), { status: 400 })).toThrow(
        new Error(
          `[better-handler] The error tag "${tag}" is reserved for the built-in ${tag} variant. Rename the declared error.`
        )
      )
    }
  )

  it('refuses an empty tag', () => {
    expect(() => defineError(untyped(''), { status: 400 })).toThrow(
      new Error(
        '[better-handler] An error tag must be a non-empty string - rename the error declared under the empty key.'
      )
    )
  })

  it.each([
    [404, 'the primitive 404'],
    [undefined, 'undefined'],
    [{ tag: 'x' }, 'a plain object'],
  ])('refuses the tag %j, which is not a string', (tag, described) => {
    expect(() => defineError(untyped(tag), { status: 400 })).toThrow(
      new Error(
        `[better-handler] An error tag must be a non-empty string, not ${described}.`
      )
    )
  })

  it.each([
    [{}, 'an empty object'],
    ['z.object()', 'the string "z.object()"'],
    [
      { '~standard': { version: 2, validate: () => ({ value: 1 }) } },
      'a plain object',
    ],
    [null, 'null'],
  ])(
    'refuses the schema %j, which is not a Standard Schema',
    (schema, described) => {
      expect(() =>
        defineError('order-not-found', { status: 404, schema: untyped(schema) })
      ).toThrow(
        new Error(
          `[better-handler] The schema of error "order-not-found" must be a Standard Schema, not ${described}.`
        )
      )
    }
  )

  it.each([
    [399, 'the primitive 399'],
    [600, 'the primitive 600'],
    [404.5, 'the primitive 404.5'],
    ['404', 'the string "404"'],
    [Number.NaN, 'the primitive NaN'],
    [undefined, 'undefined'],
  ])('refuses the status %j', (status, described) => {
    expect(() =>
      defineError('order-not-found', { status: untyped(status) })
    ).toThrow(
      new Error(
        `[better-handler] The status of error "order-not-found" must be an integer from 400 to 599, not ${described}.`
      )
    )
  })

  it.each([
    [404, 'the primitive 404'],
    [null, 'null'],
    [[404], 'an array'],
  ])(
    'refuses the entry %j, which is not { status, schema? }',
    (entry, described) => {
      expect(() => defineError('order-not-found', untyped(entry))).toThrow(
        new Error(
          `[better-handler] Error "order-not-found" must be declared as { status, schema? }, not ${described}.`
        )
      )
    }
  )

  it('refuses a key an entry does not take, such as the retired `payload`', () => {
    // Read as an entry without a schema, `payload:` would silently declare
    // fields that are never checked.
    expect(() =>
      defineError(
        'order-not-found',
        untyped({ status: 404, payload: orderRef })
      )
    ).toThrow(
      new Error(
        '[better-handler] Error "order-not-found" declares an unknown key "payload". An entry takes status and schema only.'
      )
    )
  })
})

describe('the declaration-time throw order', () => {
  // Each rule runs over every entry before the next rule starts: a reserved
  // tag, then a schema that is not a Standard Schema, then a status out of
  // range, then a key an entry does not take.

  it('reports a reserved tag before a bad schema and a bad status', () => {
    expect(() =>
      defineError(
        untyped('validation-failed'),
        untyped({ status: 99, schema: 'nope', payload: 1 })
      )
    ).toThrow(/The error tag "validation-failed" is reserved/)
  })

  it('reports a bad schema before a bad status', () => {
    expect(() =>
      defineError('order-not-found', untyped({ status: 99, schema: 'nope' }))
    ).toThrow(/The schema of error "order-not-found" must be a Standard Schema/)
  })

  it('reports a bad status before an unknown key', () => {
    expect(() =>
      defineError('order-not-found', untyped({ status: 99, payload: 1 }))
    ).toThrow(/The status of error "order-not-found" must be an integer/)
  })

  it('holds across a whole map, whatever order its keys were written in', () => {
    // The function a route's `errors` goes through.
    const misdeclared = {
      'bad-status': { status: 99 },
      'bad-schema': { status: 404, schema: 'nope' },
      'request-failed': { status: 502 },
    }

    expect(() => resolveErrors(untyped(misdeclared))).toThrow(
      /The error tag "request-failed" is reserved/
    )

    const { 'request-failed': _reserved, ...withoutReserved } = misdeclared

    expect(() => resolveErrors(untyped(withoutReserved))).toThrow(
      /The schema of error "bad-schema" must be a Standard Schema/
    )
  })
})

describe("a route's checked declarations", () => {
  it('are a prototype-less lookup by tag', () => {
    const resolved = resolveErrors({
      'order-not-found': { status: 404, schema: orderRef },
      constructor: { status: 409 },
    })

    expect(Object.getPrototypeOf(resolved)).toBeNull()
    expect(resolved['order-not-found']).toEqual({
      tag: 'order-not-found',
      status: 404,
      schema: orderRef,
    })
    expect(resolved.constructor).toEqual({
      tag: 'constructor',
      status: 409,
      schema: undefined,
    })
    expect(resolved.toString).toBeUndefined()
  })
})
