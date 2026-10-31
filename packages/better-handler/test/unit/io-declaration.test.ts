import { untyped, wire } from '@dphonys/test-utils/h3-app'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../src/runtime/server'

// What a route module throws when it is evaluated with an `input` the
// compile guard would have refused: the answer a plain-JavaScript route file
// gets, before the route can serve anything.

const page = z.object({ page: z.coerce.number() })

/** Evaluate a route declaring `input`, as a route module does. */
function declaring<Input>(input: Input): () => void {
  return () => defineBetterEventHandler(untyped({ input }), () => null)
}

describe('an input that is no map of schemas', () => {
  it.each([
    [null, 'null'],
    ['query', 'the primitive query'],
    [[page], 'an array'],
  ])('refuses %j', (input, described) => {
    expect(declaring(input)).toThrow(
      new Error(
        `[better-handler] The input of defineBetterEventHandler must be a map of schemas keyed by validation source, not ${described}.`
      )
    )
  })
})

describe('a key under input that names no source', () => {
  it('refuses the pre-rename routerParams', () => {
    expect(declaring({ routerParams: page })).toThrow(
      new Error(
        '[better-handler] The input declares "routerParams", which is not a validation source - the sources are route, query, headers and body.'
      )
    )
  })

  it('refuses a misspelling standing beside a real source', () => {
    // The walk visits the four sources, never the author's keys, so without
    // this the route would serve with `quary` silently unvalidated.
    expect(declaring({ query: page, quary: page })).toThrow(
      new Error(
        '[better-handler] The input declares "quary", which is not a validation source - the sources are route, query, headers and body.'
      )
    )
  })

  it('is refused before a slot that holds no schema', () => {
    expect(declaring({ query: null, quary: page })).toThrow(/"quary"/)
  })
})

describe('a slot holding something that is not a Standard Schema', () => {
  it.each([
    [null, 'null'],
    [{ parse: 'not it' }, 'a plain object'],
    [() => 'a parser', 'a function'],
  ])('refuses %j in a bare slot', (slot, described) => {
    // Without this every request would answer 500 with an unattributed
    // TypeError naming neither this package nor the source that broke.
    expect(declaring({ body: slot })).toThrow(
      new Error(
        `[better-handler] The body input must be a Standard Schema or a non-empty tuple of them, not ${described}.`
      )
    )
  })

  it('names the offending element of a composed tuple by its index', () => {
    expect(declaring({ query: [page, wire('{ "parse": "not it" }')] })).toThrow(
      new Error(
        '[better-handler] The query input holds a plain object at index 1, which is not a Standard Schema.'
      )
    )
  })

  it('refuses an empty tuple, which would validate nothing', () => {
    expect(declaring({ headers: [] })).toThrow(
      new Error(
        '[better-handler] The headers input is an empty tuple. Declare at least one schema, or remove the key.'
      )
    )
  })

  it('takes anything carrying the Standard Schema v1 contract, and nothing else', () => {
    expect(
      declaring({
        query: {
          '~standard': {
            version: 1,
            vendor: 'hand-written',
            validate: () => ({ value: undefined }),
          },
        },
      })
    ).not.toThrow()

    // The contract is a `validate` function under version 1: the marker
    // property alone is not a schema.
    expect(
      declaring({
        query: wire('{ "~standard": { "version": 1, "vendor": "broken" } }'),
      })
    ).toThrow('must be a Standard Schema')
    expect(
      declaring({
        query: {
          '~standard': { version: 2, vendor: 'future', validate: () => ({}) },
        },
      })
    ).toThrow('must be a Standard Schema')
  })

  it('checks a slot left undefined as no slot at all', () => {
    expect(declaring({ query: page, body: undefined })).not.toThrow()
  })
})

describe('the declaration-time order', () => {
  it('reports a misdeclared errors map before a misdeclared input', () => {
    expect(() =>
      defineBetterEventHandler(
        untyped({
          input: { quary: page },
          errors: { 'validation-failed': { status: 400 } },
        }),
        () => null
      )
    ).toThrow(
      new Error(
        '[better-handler] The error tag "validation-failed" is reserved for the built-in validation-failed variant. Rename the declared error.'
      )
    )
  })
})
