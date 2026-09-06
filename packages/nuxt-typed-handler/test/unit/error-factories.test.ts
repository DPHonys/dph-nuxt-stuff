import { createError } from 'h3'
import type { H3Error } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  defineError,
  defineTypedEventHandler,
  recognizeKnownError,
  recognizeValidationError,
} from '../../src/runtime/server'
import { firstError, postJson, request } from '../h3-app'

describe('handler-local error factories', () => {
  it('provides only local factories, without reading an undeclared body', async () => {
    const contexts: object[] = []
    const handler = defineTypedEventHandler(
      { errors: [defineError('missing', { status: 404 })] },
      (_event, ctx) => {
        contexts.push(ctx)
        expect(Object.keys(ctx)).toEqual(['errors'])
        expect(Object.isFrozen(ctx.errors)).toBe(true)
        throw ctx.errors.missing()
      }
    )
    const seen: H3Error[] = []
    for (let i = 0; i < 2; i++) {
      const response = await request(handler, '/api/test', {
        init: postJson('{ invalid'),
        onError: (error) => seen.push(error),
      })
      expect(response.status).toBe(404)
    }
    expect(recognizeKnownError(firstError(seen))).toEqual({
      tag: 'missing',
      status: 404,
    })
    expect(contexts[0]).not.toBe(contexts[1])
  })

  it('exposes transformed flat payload fields', async () => {
    const schema = z.string().transform((value) => ({ count: Number(value) }))
    const handler = defineTypedEventHandler(
      { errors: [defineError('conflict', { status: 409, payload: schema })] },
      (_event, { errors }) => {
        throw errors.conflict('3')
      }
    )
    const seen: H3Error[] = []
    const response = await request(handler, '/api/test', {
      onError: (error) => seen.push(error),
    })
    expect(response.status).toBe(409)
    expect(recognizeKnownError(firstError(seen))).toEqual({
      tag: 'conflict',
      status: 409,
      count: 3,
    })
  })

  it('rejects invalid error data without a known marker', async () => {
    const schema = z
      .string()
      .min(10)
      .transform((value) => ({ value }))
    const handler = defineTypedEventHandler(
      { errors: [defineError('bad', { status: 400, payload: schema })] },
      async (_event, { errors }) => {
        await Promise.resolve()
        throw errors.bad('short')
      }
    )
    const seen: H3Error[] = []
    const response = await request(handler, '/api/test', {
      onError: (error) => seen.push(error),
    })
    expect(response.status).toBe(500)
    expect(recognizeKnownError(firstError(seen))).toBeUndefined()
  })

  it('combines all validated sources with factories and preserves success', async () => {
    const handler = defineTypedEventHandler(
      {
        validate: {
          body: z.object({ name: z.string() }),
          query: z.object({ page: z.string().transform(Number) }),
          routerParams: z.object({ id: z.string() }),
          headers: z.object({ token: z.string() }),
        },
        errors: [
          ...defineError({
            conflict: {
              status: 409,
              payload: z.number().transform((value) => ({ page: value })),
            },
          }),
        ],
      },
      async (_event, ctx) => {
        if (ctx.query.page > 1) throw ctx.errors.conflict(ctx.query.page)
        return {
          keys: Object.keys(ctx).toSorted(),
          name: ctx.body.name,
          page: ctx.query.page,
          id: ctx.routerParams.id,
          token: ctx.headers.token,
        }
      }
    )
    const options = {
      route: '/api/test/:id',
      init: postJson('{"name":"Ada"}', { token: 'secret' }),
    }
    const success = await request(handler, '/api/test/42?page=1', options)
    await expect(success.json()).resolves.toEqual({
      keys: ['body', 'errors', 'headers', 'query', 'routerParams'],
      name: 'Ada',
      page: 1,
      id: '42',
      token: 'secret',
    })
    const seen: H3Error[] = []
    const failure = await request(handler, '/api/test/42?page=2', {
      ...options,
      onError: (error) => seen.push(error),
    })
    expect(failure.status).toBe(409)
    expect(recognizeKnownError(firstError(seen))).toEqual({
      tag: 'conflict',
      status: 409,
      page: 2,
    })
  })

  it('preserves composed source merging alongside factories', async () => {
    const handler = defineTypedEventHandler(
      {
        validate: {
          query: [
            z.object({ page: z.string().transform(Number) }),
            z.object({ search: z.string() }),
          ],
        },
        errors: [defineError('missing', { status: 404 })],
      },
      (_event, { query, errors }) => {
        if (query.search === '') throw errors.missing()
        return query
      }
    )
    const response = await request(handler, '/api/test?page=2&search=abc')
    await expect(response.json()).resolves.toEqual({ page: 2, search: 'abc' })
  })

  it('retains both validation markers and never runs the handler on invalid input', async () => {
    const body = vi.fn(() => null)
    const handler = defineTypedEventHandler(
      {
        validate: { body: z.string() },
        errors: [defineError('missing', { status: 404 })],
      },
      body
    )
    const seen: H3Error[] = []
    const response = await request(handler, '/api/test', {
      init: postJson('{}'),
      onError: (error) => seen.push(error),
    })
    expect(response.status).toBe(400)
    expect(body).not.toHaveBeenCalled()
    expect(recognizeKnownError(firstError(seen))).toMatchObject({
      tag: 'validationFailed',
      status: 400,
      issues: [{ source: 'body' }],
    })
    expect(recognizeValidationError(firstError(seen))).toMatchObject({
      issues: [{ source: 'body' }],
    })
  })

  it.each([false, true])(
    'preserves unrelated thrown error identity (async handler: %s)',
    async (asyncHandler) => {
      const error = createError({ statusCode: 418, message: 'unrelated' })
      const throwError = () => {
        throw error
      }
      const handler = defineTypedEventHandler(
        { errors: [defineError('missing', { status: 404 })] },
        asyncHandler ? async () => throwError() : throwError
      )
      const seen: H3Error[] = []
      await request(handler, '/api/test', {
        onError: (value) => seen.push(value),
      })
      expect(seen[0]).toBe(error)
    }
  )

  it('rejects an asynchronous payload schema at the factory call', async () => {
    const handler = defineTypedEventHandler(
      {
        errors: [
          defineError('bad', {
            status: 400,
            payload: z.string().transform(async (value) => ({ value })),
          }),
        ],
      },
      (_event, { errors }) => {
        throw errors.bad('input')
      }
    )
    const seen: H3Error[] = []
    const response = await request(handler, '/api/test', {
      onError: (value) => seen.push(value),
    })
    expect(response.status).toBe(500)
    expect(seen[0]).toMatchObject({
      message: expect.stringContaining('validates asynchronously'),
    })
    expect(recognizeKnownError(firstError(seen))).toBeUndefined()
  })

  // Every declaration the compile guards refuse below is what a JavaScript
  // caller can still write, so the runtime answers too.

  it('rejects reserved tags before planning validation, including without validation', () => {
    for (const validate of [undefined, { body: 42 }]) {
      expect(() =>
        defineTypedEventHandler(
          {
            // @ts-expect-error - not a schema, and the reserved tag
            validate,
            errors: [defineError('validationFailed', { status: 400 })],
          },
          () => null
        )
      ).toThrow('"validationFailed" is reserved')
    }
  })

  it('rejects inline records', () => {
    expect(() =>
      defineTypedEventHandler(
        // @ts-expect-error - a record where the array belongs
        { errors: { missing: { status: 404 } } },
        () => null
      )
    ).toThrow(TypeError)
  })

  it('requires a nonempty declaration, but allows empty arrays alongside validation', async () => {
    expect(() =>
      // @ts-expect-error - declares nothing
      defineTypedEventHandler({ errors: [] }, () => null)
    ).toThrow('needs validate, errors, or both')
    expect(() =>
      // @ts-expect-error - declares nothing
      defineTypedEventHandler({ validate: {}, errors: [] }, () => null)
    ).toThrow('needs validate, errors, or both')
    const handler = defineTypedEventHandler(
      { validate: { query: z.object({}) }, errors: [] },
      (_event, ctx) => Object.keys(ctx).sort()
    )
    await expect((await request(handler, '/api/test')).json()).resolves.toEqual(
      ['query']
    )
  })
})
