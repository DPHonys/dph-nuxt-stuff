import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import { recognizeKnownError } from '../../src/runtime/server'
import { developerFault } from '../../src/runtime/server/faults'

// The server recognizer, without a Nuxt boot: what an error hook or a
// middleware reads off the error it is handed. It looks at the error's own
// `data`, the depth a route's boundary writes, and nowhere else.

describe('recognizeKnownError', () => {
  it('hands back the Tagged error a Known error carries, itself', () => {
    const data = { _tag: 'order-not-found', id: 7 }
    const error = createError({
      statusCode: 404,
      message: 'order-not-found',
      data,
    })

    expect(recognizeKnownError(error)).toBe(data)
  })

  it('reads the built-in validation-failed variant the same way', () => {
    const data = { _tag: 'validation-failed', issues: [] }
    const error = createError({ statusCode: 400, data })

    expect(recognizeKnownError(error)?._tag).toBe('validation-failed')
  })

  it.each([
    ['an error without data', new Error('boom')],
    ['a developer fault', developerFault('a mistake')],
    ['data without a _tag', createError({ data: { reason: 'teapot' } })],
    ['a _tag that is not a string', createError({ data: { _tag: 7 } })],
    [
      'data that is not a plain object',
      createError({
        data: Object.assign(new Date(), { _tag: 'order-locked' }),
      }),
    ],
  ])('answers undefined for %s', (_, error) => {
    expect(recognizeKnownError(error)).toBeUndefined()
  })

  it('does not recognise a callee’s Known error one level down', () => {
    // What an escaped fetch failure carries: the callee's whole error body as
    // its `data`, the Tagged error under that. It is the caller's bug.
    const escaped = createError({
      statusCode: 404,
      data: {
        statusCode: 404,
        message: 'order-not-found',
        data: { _tag: 'order-not-found', id: 7 },
      },
    })

    expect(recognizeKnownError(escaped)).toBeUndefined()
  })
})
