import type { KnownErrorsOfHandler } from '@dphonys/nuxt-handler-errors/types'
import type { RequestInputOfHandler } from '@dphonys/nuxt-handler-validation/types'
import type { H3Event } from 'h3'
import { it } from 'vitest'
import { z } from 'zod'
import type {
  ErrorDefinitions,
  ErrorDefinitionsGuard,
  ErrorFactories,
  ErrorsOfDefinitions,
  ValidationFailed,
} from '../../src/runtime/types'
import type { Assert, Equal } from './assert'

declare const defineTypedEventHandler: typeof import('../../src/runtime/server').defineTypedEventHandler

const definitions = {
  missing: { status: 404 },
  conflict: {
    status: 409,
    data: z.object({ count: z.string().transform(Number) }),
  },
} as const satisfies ErrorDefinitions

type Flatten<T> = T extends unknown ? { [K in keyof T]: T[K] } : never
type Expected =
  | { tag: 'missing'; status: 404 }
  | { tag: 'conflict'; status: 409; data: { count: number } }
type _exports = Assert<
  Equal<Flatten<ErrorsOfDefinitions<typeof definitions>>, Expected>
>
type _guardExport = Assert<
  Equal<keyof ErrorDefinitionsGuard<typeof definitions>, 'missing' | 'conflict'>
>

export function recordOnly() {
  return defineTypedEventHandler({ errors: definitions }, (_event, ctx) => {
    const factories: ErrorFactories<typeof definitions> = ctx.errors
    const tag: 'missing' = factories.missing.tag
    const status: 404 = factories.missing.status
    factories.missing()
    factories.conflict({ count: '2' })
    // @ts-expect-error No unrestricted fail in the record context.
    ctx.fail('missing')
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
    return { tag, status }
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
      // @ts-expect-error Record context has no legacy fail.
      ctx.fail('conflict', { count: 1 })
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
    const count: number = error.data.count
    // @ts-expect-error Record data is nested, never flattened into the variant.
    void error.count
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
type _recordErrors = Assert<
  Equal<Flatten<KnownErrorsOfHandler<ReturnType<typeof recordOnly>>>, Expected>
>
type _noSources = Assert<
  // eslint-disable-next-line ts/no-empty-object-type
  Equal<RequestInputOfHandler<ReturnType<typeof recordOnly>>, {}>
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
  // @ts-expect-error Reserved even without validation.
  defineTypedEventHandler(
    { errors: { 'validation-failed': { status: 400 } } },
    () => null
  )
  // @ts-expect-error Reserved with validation, too.
  defineTypedEventHandler(
    {
      validate: { body: z.string() },
      errors: { 'validation-failed': { status: 400 } },
    },
    () => null
  )
  // @ts-expect-error Nothing declared.
  defineTypedEventHandler({ errors: {} }, () => null)
  // @ts-expect-error Empty validation still declares nothing.
  defineTypedEventHandler({ validate: {}, errors: {} }, () => null)
  // @ts-expect-error Status must be numeric; the parent checks its range at runtime.
  defineTypedEventHandler({ errors: { bad: { status: '400' } } }, () => null)
  // @ts-expect-error Legacy payload slots are forbidden in record definitions.
  defineTypedEventHandler(
    { errors: { bad: { status: 400, payload: z.string() } } },
    () => null
  )
  // @ts-expect-error Data must be a Standard Schema.
  defineTypedEventHandler(
    { errors: { bad: { status: 400, data: {} } } },
    () => null
  )
  // @ts-expect-error Output must survive JSON serialization.
  defineTypedEventHandler(
    { errors: { bad: { status: 400, data: z.bigint() } } },
    () => null
  )
  defineTypedEventHandler(
    // @ts-expect-error Request schemas retain their guard.
    { validate: { body: 42 }, errors: definitions },
    () => null
  )
  defineTypedEventHandler(
    { validate: { body: z.string() }, errors: {} },
    (_event, ctx) => {
      type _emptyFactories = Assert<Equal<keyof typeof ctx.errors, never>>
      return ctx.body
    }
  )
  defineTypedEventHandler({ validate: { body: z.string() } }, (_event, ctx) => {
    // @ts-expect-error Validation-only context has no factories.
    void ctx.errors
    // @ts-expect-error Validation-only context has no fail.
    void ctx.fail
    return ctx.body
  })
}

it('is asserted by the compiler', () => {})
