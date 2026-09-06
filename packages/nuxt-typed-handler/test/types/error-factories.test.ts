import { defineError } from '@dphonys/nuxt-handler-errors/server'
import type {
  KnownErrorsOfHandler,
  KnownErrorsOf,
} from '@dphonys/nuxt-handler-errors/types'
import type { RequestInputOfHandler } from '@dphonys/nuxt-handler-validation/types'
import type { H3Event } from 'h3'
import { it } from 'vitest'
import { z } from 'zod'
import type { ErrorFactories, ValidationFailed } from '../../src/runtime/types'
import type { Assert, Equal } from './assert'

declare const defineTypedEventHandler: typeof import('../../src/runtime/server').defineTypedEventHandler

const definitions = [
  ...defineError({
    missing: { status: 404 },
    conflict: {
      status: 409,
      payload: z.object({ count: z.string().transform(Number) }),
    },
  }).pick('missing', 'conflict'),
]

type Flatten<T> = T extends unknown ? { [K in keyof T]: T[K] } : never
type Expected =
  | { tag: 'missing'; status: 404 }
  | { tag: 'conflict'; status: 409; count: number }
type _exports = Assert<
  Equal<Flatten<KnownErrorsOf<typeof definitions>>, Expected>
>

export function errorsOnly() {
  return defineTypedEventHandler({ errors: definitions }, (_event, ctx) => {
    const factories: ErrorFactories<typeof definitions> = ctx.errors
    factories.missing()
    factories.conflict({ count: '2' })
    // @ts-expect-error Only declared keys are available.
    ctx.errors.unknown()
    // @ts-expect-error No-data errors accept no arguments.
    ctx.errors.missing({})
    // @ts-expect-error Data is required.
    ctx.errors.conflict()
    // @ts-expect-error Factories accept schema input, not output.
    ctx.errors.conflict({ count: 2 })
    // @ts-expect-error Factories cannot be replaced.
    ctx.errors.missing = factories.missing
    // @ts-expect-error The errors slot is readonly.
    ctx.errors = factories
    // @ts-expect-error Undeclared validation sources are absent.
    void ctx.body
    return { ok: true }
  })
}

export function combined() {
  return defineTypedEventHandler(
    {
      validate: {
        body: z.object({ name: z.string() }),
        query: z.object({ page: z.string().transform(Number) }),
        routerParams: z.object({ id: z.string() }),
        headers: z.object({ token: z.string() }),
      },
      errors: definitions,
    },
    async (_event, ctx) => {
      const page: number = ctx.query.page
      const sources: string[] = [
        ctx.body.name,
        ctx.routerParams.id,
        ctx.headers.token,
      ]
      // @ts-expect-error The built-in error is not a user factory.
      ctx.errors['validation-failed']()
      if (page > 1) throw ctx.errors.conflict({ count: String(page) })
      return { page, sources }
    }
  )
}

export function requestAnnotation() {
  return defineTypedEventHandler(
    { errors: definitions },
    (event: H3Event<{ body: { custom: string } }>) => event.context
  )
}

export function composedSources() {
  return defineTypedEventHandler(
    {
      validate: {
        query: [
          z.object({ page: z.string().transform(Number) }),
          z.object({ search: z.string() }),
        ],
      },
      errors: definitions,
    },
    (_event, { query, errors }) => {
      const page: number = query.page
      if (query.search === '') throw errors.missing()
      return { page, search: query.search }
    }
  )
}

type _composedInput = Assert<
  Equal<
    RequestInputOfHandler<ReturnType<typeof composedSources>>,
    { query: { page: string; search: string } }
  >
>

export function narrowError(
  error: KnownErrorsOfHandler<ReturnType<typeof combined>>
) {
  if (error.tag === 'conflict') {
    const count: number = error.count
    // @ts-expect-error Payload fields are flat, not nested in data.
    void error.data
    return count
  }
  if (error.tag === 'validation-failed') return error.issues
  // @ts-expect-error No-data definitions add no data slot.
  return error.data
}

type _request = Assert<
  Equal<
    Parameters<ReturnType<typeof requestAnnotation>>[0],
    H3Event<{ body: { custom: string } }>
  >
>
type _errors = Assert<
  Equal<Flatten<KnownErrorsOfHandler<ReturnType<typeof errorsOnly>>>, Expected>
>
type _noSources = Assert<
  // eslint-disable-next-line ts/no-empty-object-type
  Equal<RequestInputOfHandler<ReturnType<typeof errorsOnly>>, {}>
>
type _combinedErrors = Assert<
  Equal<
    Flatten<KnownErrorsOfHandler<ReturnType<typeof combined>>>,
    Expected | ValidationFailed
  >
>
type _input = Assert<
  Equal<
    RequestInputOfHandler<ReturnType<typeof combined>>,
    {
      body: { name: string }
      query: { page: string }
      routerParams: { id: string }
      headers: { token: string }
    }
  >
>
type _success = Assert<
  Equal<
    Awaited<ReturnType<ReturnType<typeof combined>>>,
    { page: number; sources: string[] }
  >
>

export function misuse() {
  const stringInput = defineError('conflict', {
    status: 409,
    payload: z
      .string()
      .transform(Number)
      .transform((count) => ({ count })),
  })
  const numberInput = defineError('conflict', {
    status: 409,
    payload: z.number().transform((count) => ({ count })),
  })
  defineTypedEventHandler(
    // @ts-expect-error Equal output does not erase divergent factory inputs.
    { errors: [stringInput, numberInput] },
    () => null
  )
  defineTypedEventHandler(
    // @ts-expect-error Reserved even without validation.
    { errors: [defineError('validation-failed', { status: 400 })] },
    () => null
  )
  defineTypedEventHandler(
    // @ts-expect-error Reserved with validation, too.
    {
      validate: { body: z.string() },
      errors: [defineError('validation-failed', { status: 400 })],
    },
    () => null
  )
  // @ts-expect-error Nothing declared.
  defineTypedEventHandler({ errors: [] }, () => null)
  // @ts-expect-error Empty validation still declares nothing.
  defineTypedEventHandler({ validate: {}, errors: [] }, () => null)
  // @ts-expect-error Inline records are not supported.
  defineTypedEventHandler({ errors: { bad: { status: 400 } } }, () => null)
  defineTypedEventHandler(
    // @ts-expect-error Request schemas retain their guard.
    { validate: { body: 42 }, errors: definitions },
    () => null
  )
  defineTypedEventHandler(
    { validate: { body: z.string() }, errors: [] },
    (_event, ctx) => {
      // @ts-expect-error Empty declarations do not add a factories slot.
      void ctx.errors
      return ctx.body
    }
  )
  defineTypedEventHandler({ validate: { body: z.string() } }, (_event, ctx) => {
    // @ts-expect-error Validation-only context has no factories.
    void ctx.errors
    return ctx.body
  })
}

it('is asserted by the compiler', () => {})
