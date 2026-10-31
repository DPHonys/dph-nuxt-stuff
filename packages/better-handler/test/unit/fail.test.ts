import { untyped } from '@dphonys/test-utils/h3-app'
import { H3Error } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { resolveErrors } from '../../src/runtime/server/errors/declaration'
import { createFail } from '../../src/runtime/server/errors/fail'

// What the Fail helper hands back for the handler to throw, without a Nuxt
// boot: built from checked declarations exactly as a route's wrapper builds
// it. The route boundary reads its result as any thrown tagged value: its
// own enumerable properties, which a spread collects.

const fail = createFail(
  resolveErrors({
    'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
    'order-locked': { status: 409 },
    'order-odd': {
      status: 422,
      schema: z.object({
        message: z.string(),
        name: z.string(),
        stack: z.string(),
        cause: z.string(),
      }),
    },
    ['__proto__']: { status: 400 },
  })
)

/** The developer fault a call throws; anything else fails the test. */
function faultOf(run: () => Error): H3Error {
  try {
    run()
  } catch (error) {
    if (error instanceof H3Error) return error

    throw error
  }

  throw new Error('expected the call to throw')
}

describe('fail', () => {
  it('returns an Error carrying the tag and the fields as its own', () => {
    const failed = fail('order-not-found', { id: 7 })

    expect(failed).toBeInstanceOf(Error)
    expect({ ...failed }).toEqual({ _tag: 'order-not-found', id: 7 })
    expect(Object.keys(failed)).toEqual(['_tag', 'id'])
  })

  it('carries the tag alone for an error declared without a schema', () => {
    const failed = fail('order-locked')

    expect(failed).toBeInstanceOf(Error)
    expect({ ...failed }).toEqual({ _tag: 'order-locked' })
  })

  it('has a stack that starts where the handler called it', () => {
    function handlerBody(): Error {
      return fail('order-locked')
    }

    const [headline, firstFrame] = (handlerBody().stack ?? '').split('\n')

    expect(headline).toBe('FailedError: order-locked')
    expect(firstFrame).toContain('handlerBody')
  })

  it('keeps Error’s own message and name out of the fields', () => {
    const failed = fail('order-locked')

    expect(failed.message).toBe('order-locked')
    expect(failed.name).toBe('FailedError')
    expect(Object.keys(failed)).not.toContain('message')
    expect(Object.keys(failed)).not.toContain('stack')
  })

  it('makes a field named like an Error property an enumerable field', () => {
    const failed = fail('order-odd', {
      message: 'the field',
      name: 'also a field',
      stack: 'a field too',
      cause: 'and this',
    })

    expect({ ...failed }).toEqual({
      _tag: 'order-odd',
      message: 'the field',
      name: 'also a field',
      stack: 'a field too',
      cause: 'and this',
    })
    expect(failed.message).toBe('the field')
  })

  it('never lets a field displace the tag', () => {
    const failed = fail('order-not-found', untyped({ id: 7, _tag: 'spoofed' }))

    expect({ ...failed }).toEqual({ _tag: 'order-not-found', id: 7 })
  })

  it('copies the fields, so a later change to the caller’s object is not sent', () => {
    const fields = { id: 7 }
    const failed = fail('order-not-found', fields)

    fields.id = 8

    expect({ ...failed }).toEqual({ _tag: 'order-not-found', id: 7 })
  })

  it('does not run the schema: the fields go out as they were handed over', () => {
    // The thrown fields are asserted against the schema only by the
    // development check at the route's boundary.
    const failed = fail('order-not-found', untyped({ id: 'seven' }))

    expect({ ...failed }).toEqual({
      _tag: 'order-not-found',
      id: 'seven',
    })
  })

  it('takes `__proto__` as an ordinary declared tag', () => {
    expect({ ...fail('__proto__') }).toEqual({ _tag: '__proto__' })
  })
})

describe('fail refuses a call the types would have refused', () => {
  it.each(['order-unknown', 'validation-failed', 'toString'])(
    'refuses the undeclared tag %s with a developer fault',
    (tag) => {
      expect(faultOf(() => fail(tag))).toMatchObject({
        statusCode: 500,
        message: `[better-handler] fail(${JSON.stringify(tag)}) names no error this route declares. The route declares "order-not-found", "order-locked", "order-odd", "__proto__".`,
        data: undefined,
      })
    }
  )

  it('names "none" when the route declares an empty map', () => {
    expect(
      faultOf(() => createFail(resolveErrors({}))('anything'))
    ).toMatchObject({
      statusCode: 500,
      message:
        '[better-handler] fail("anything") names no error this route declares. The route declares none.',
    })
  })

  it.each([
    [404, 'the primitive 404'],
    [10n, 'the primitive 10'],
    [Symbol('404'), 'the primitive Symbol(404)'],
    [{ toString: () => '404' }, 'a plain object'],
    [undefined, 'undefined'],
  ])('refuses the tag %o, which is not a string', (tag, handed) => {
    // The lookup would coerce a number to the declared key '404' and hand
    // back an error whose `_tag` is the number.
    const failNumeric = untyped(
      createFail(resolveErrors({ '404': { status: 404 } }))
    )

    expect(faultOf(() => failNumeric(tag))).toMatchObject({
      statusCode: 500,
      message: `[better-handler] fail takes an error tag, a string, and was handed ${handed}. The route declares "404".`,
      data: undefined,
    })
  })

  it('refuses fields for a tag declared without a schema', () => {
    expect(faultOf(() => fail('order-locked', { id: 7 }))).toMatchObject({
      statusCode: 500,
      message:
        '[better-handler] fail("order-locked") takes no fields: the error is declared without a schema, and was handed a plain object.',
    })
  })

  it.each([
    [[], 'nothing'],
    [['seven'], 'the string "seven"'],
    [[null], 'null'],
    [[[7]], 'an array'],
    [[{ id: 7 }, { id: 8 }], '2 arguments'],
  ])(
    'refuses the arguments %j for a tag declared with a schema',
    (args, handed) => {
      expect(faultOf(() => fail('order-not-found', ...args))).toMatchObject({
        statusCode: 500,
        message: `[better-handler] fail("order-not-found") takes one object of the fields its schema describes, and was handed ${handed}.`,
      })
    }
  )
})
