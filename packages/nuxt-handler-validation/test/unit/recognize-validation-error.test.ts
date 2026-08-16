import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler, H3Error } from 'h3'
import { createError } from 'h3'
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineValidatedEventHandler,
  recognizeValidationError,
} from '../../src/runtime/server'
import { postJson, request } from '../h3-app'

// The observability read, from the seat that consumes it: h3's `onError` hook,
// where a Nitro `error` hook sits.

/** A handler that fails validation for any request that reaches it. */
const failingHandler = defineValidatedEventHandler(
  { validate: { query: z.object({ page: z.coerce.number() }) } },
  () => 'the body never runs'
)

/**
 * A failure marked the way a second physical copy of this package marks one:
 * the same key off the global symbol registry, written from outside this
 * module. Version skew and Nuxt layers produce exactly this, which is why the
 * key is not a module-local `Symbol()`.
 */
function markedByAnotherCopy(payload: unknown): H3Error {
  return Object.defineProperty(
    createError({ statusCode: 400 }),
    Symbol.for('@dphonys/nuxt-handler-validation:error'),
    { value: payload, enumerable: false }
  )
}

/** The error an operator's hook is handed for one request, if any. */
async function reportedBy(
  handler: EventHandler,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  let reported: unknown

  await request(handler, path, {
    ...(init !== undefined && { init }),
    onError: (error) => void (reported = error),
  })

  return reported
}

describe('a validation failure at the error hook', () => {
  it('is recognized, and answers with the issues it raised', async () => {
    const reported = await reportedBy(failingHandler, '/api/test?page=nope')

    expect(recognizeValidationError(reported)).toEqual({
      issues: [
        {
          source: 'query',
          message: expect.any(String),
          path: ['page'],
        },
      ],
    })
  })

  it('carries the marker where no copy of the error can take it', async () => {
    const reported = await reportedBy(failingHandler, '/api/test?page=nope')

    // Both copies the error meets on its way to a client: Nitro's production
    // handler builds a fresh body, and the response writer stringifies. A
    // non-enumerable symbol survives neither.
    expect(
      recognizeValidationError({ ...(reported as object) })
    ).toBeUndefined()
    expect(
      recognizeValidationError(JSON.parse(JSON.stringify(reported)))
    ).toBeUndefined()
  })

  it('answers what was raised, not what the error currently says', async () => {
    const reported = (await reportedBy(
      failingHandler,
      '/api/test?page=nope'
    )) as Record<string, unknown> & {
      data: { issues: unknown[] }
    }

    // The wire payload is enumerable, so every middleware in the chain can edit
    // or replace it. None of that may reach the marker.
    reported.data.issues.push({ source: 'body', message: 'forged', path: [] })
    reported.data.issues.length = 0
    reported.data = { issues: [] }

    expect(recognizeValidationError(reported)?.issues).toHaveLength(1)
  })

  it('is recognized when the body itself could not be read', async () => {
    const bodyHandler = defineValidatedEventHandler(
      { validate: { body: z.object({ name: z.string() }) } },
      () => 'the body never runs'
    )

    const reported = await reportedBy(
      bodyHandler,
      '/api/test',
      postJson('{ not json at all')
    )

    // A client mistake like any other, so the absorbed 4xx is marked exactly as
    // a rejecting schema is.
    expect(recognizeValidationError(reported)).toEqual({
      issues: [{ source: 'body', message: expect.any(String), path: [] }],
    })
  })
})

// The half that makes the predicate safe in front of a `return`: a hook that
// skips validation failures must still report every bug this package raises.
describe('a developer mistake at the error hook', () => {
  it('is not recognized when a schema’s own `validate` throws', async () => {
    const broken: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => {
          throw new Error('the schema itself is broken')
        },
      },
    }

    const handler = defineValidatedEventHandler(
      { validate: { query: broken } },
      () => 'the body never runs'
    )

    const reported = await reportedBy(handler, '/api/test')

    expect(recognizeValidationError(reported)).toBeUndefined()
  })

  it('is not recognized when a source’s outputs cannot merge', async () => {
    // The compile-time rule cannot see this one: the element's declared output
    // is an object, and only the parse reveals a string.
    const notAnObject: StandardSchemaV1<unknown, { tag: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ value: 'not an object at all' as never }),
      },
    }

    const handler = defineValidatedEventHandler(
      {
        validate: { query: [z.object({ archived: z.string() }), notAnObject] },
      },
      () => 'the body never runs'
    )

    const reported = await reportedBy(handler, '/api/test?archived=yes')

    expect(recognizeValidationError(reported)).toBeUndefined()
  })
})

describe('what the predicate reads', () => {
  /** A real failure, raised by a real request - the marked error to hand. */
  let marked: unknown

  beforeAll(async () => {
    marked = await reportedBy(failingHandler, '/api/test?page=nope')
  })

  it('reads a marker written by another copy of this package', () => {
    const issues = [{ source: 'headers', message: 'nope', path: [] }]

    expect(recognizeValidationError(markedByAnotherCopy({ issues }))).toEqual({
      issues,
    })
  })

  it('never reads `error.data`, at either wire depth', () => {
    const raised = { data: { issues: [] } }
    const fetched = { data: { data: { issues: [] } } }

    // `data` is the wire object, so reading it would recognize a failure that
    // came back over a fetch as one this process raised.
    expect(recognizeValidationError(raised)).toBeUndefined()
    expect(recognizeValidationError(fetched)).toBeUndefined()
  })

  it('never reads `error.cause`, at any depth', () => {
    const rewrapped = createError({ statusCode: 500, cause: marked })
    const deeper = createError({ statusCode: 500, cause: rewrapped })

    // A deliberate re-wrap is the caller saying "this is my 500 now".
    // Recognizing through it would suppress a report they just chose to raise.
    expect(recognizeValidationError(rewrapped)).toBeUndefined()
    expect(recognizeValidationError(deeper)).toBeUndefined()
  })

  it.each([
    ['a non-object payload', 'Validation Error'],
    ['a null payload', null],
    ['a payload with no issues at all', {}],
    ['a payload whose issues are not an array', { issues: { page: 'nope' } }],
  ])('answers undefined for a marker carrying %s', (_label, payload) => {
    // What `Symbol.for` costs: a version-skewed copy sharing the registry key
    // can put anything behind it. Malformed reads as unrecognized, never as a
    // lie typed `ValidationErrorData`.
    expect(
      recognizeValidationError(markedByAnotherCopy(payload))
    ).toBeUndefined()
  })

  it.each([
    ['an unrelated h3 error', createError({ statusCode: 403 })],
    ['a plain error', new Error('boom')],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'boom'],
  ])('answers undefined for %s', (_label, error) => {
    expect(recognizeValidationError(error)).toBeUndefined()
  })
})
