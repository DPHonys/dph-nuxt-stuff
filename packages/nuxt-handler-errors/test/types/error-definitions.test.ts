import type { H3Error } from 'h3'
import { expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  defineCheckedEventHandler,
  defineError,
} from '../../src/runtime/server'
import type {
  ErrorDefinitions,
  ErrorFactories,
  ErrorsOfDefinitions,
  KnownErrorsOfHandler,
} from '../../src/runtime/types'

const definitions = {
  notFound: { status: 404 },
  conflict: {
    status: 409,
    data: z.string().transform((value) => ({ length: value.length })),
  },
} as const satisfies ErrorDefinitions

const handler = defineCheckedEventHandler(
  { errors: definitions },
  (_event, context) => {
    expectTypeOf(context.errors).toEqualTypeOf<
      ErrorFactories<typeof definitions>
    >()
    expectTypeOf(context.errors.notFound()).toEqualTypeOf<H3Error>()
    context.errors.conflict('input')
    // @ts-expect-error no legacy fail in a record context
    context.fail('notFound')
    // @ts-expect-error undeclared factory
    context.errors.missing()
    // @ts-expect-error no-data factory takes zero arguments
    context.errors.notFound({})
    // @ts-expect-error data is required
    context.errors.conflict()
    // @ts-expect-error accepts schema input, not output
    context.errors.conflict({ length: 1 })
    return { ok: true }
  }
)

export function declarationGuards(): void {
  defineCheckedEventHandler(
    // @ts-expect-error legacy payload is not a record data schema
    { errors: { bad: { status: 404, payload: {} } } },
    () => null
  )
  // @ts-expect-error data must be a Standard Schema
  defineCheckedEventHandler(
    { errors: { bad: { status: 404, data: {} } } },
    () => null
  )
  defineCheckedEventHandler(
    // @ts-expect-error schema output must survive serialization
    { errors: { bad: { status: 404, data: z.bigint() } } },
    () => null
  )
  defineCheckedEventHandler(
    {
      // @ts-expect-error nested bigint must not bypass the data guard
      errors: { bad: { status: 404, data: z.object({ amount: z.bigint() }) } },
    },
    () => null
  )
  const nested = z.object({
    rows: z.array(z.object({ amount: z.bigint().optional() })),
  })
  defineCheckedEventHandler(
    // @ts-expect-error optional fields inside arrays must survive serialization
    { errors: { bad: { status: 404, data: nested } } },
    () => null
  )
  const union = z.union([
    z.string(),
    z.object({ nested: z.object({ value: z.symbol() }) }),
  ])
  defineCheckedEventHandler(
    // @ts-expect-error every union branch must survive serialization
    { errors: { bad: { status: 404, data: union } } },
    () => null
  )
  defineCheckedEventHandler(
    {
      errors: {
        // @ts-expect-error functions cannot survive serialization
        bad: {
          status: 404,
          data: z.string().transform(() => ({ callback: () => 1 })),
        },
      },
    },
    () => null
  )
  // @ts-expect-error numeric tags disappear from the extracted string tag union
  defineCheckedEventHandler({ errors: { 123: { status: 404 } } }, () => null)
  const symbol = Symbol('tag')
  defineCheckedEventHandler(
    // @ts-expect-error symbol tags are not wire tags
    { errors: { [symbol]: { status: 404 } } },
    () => null
  )
  defineCheckedEventHandler(
    {
      errors: {
        '123': {
          status: 404,
          data: z.object({
            rows: z.array(z.object({ amount: z.number().optional() })),
            date: z.date(),
          }),
        },
      },
    },
    (_event, context) => {
      expectTypeOf(context.errors['123'].tag).toEqualTypeOf<'123'>()
      return null
    }
  )
  interface Node {
    value: string
    children: Node[]
  }
  const recursive: z.ZodType<Node> = z.lazy(() =>
    z.object({ value: z.string(), children: z.array(recursive) })
  )
  defineCheckedEventHandler(
    { errors: { recursive: { status: 409, data: recursive } } },
    () => null
  )
}

const _legacy = defineError('old', { status: 404 })
type LegacyOptions = Parameters<
  typeof defineCheckedEventHandler<readonly [typeof _legacy], string>
>[0]

it('extracts nested output and preserves the legacy generic seam', () => {
  expectTypeOf<KnownErrorsOfHandler<typeof handler>>().toEqualTypeOf<
    ErrorsOfDefinitions<typeof definitions>
  >()
  expectTypeOf<ErrorsOfDefinitions<typeof definitions>>().toEqualTypeOf<
    | { tag: 'notFound'; status: 404 }
    | ({ tag: 'conflict'; status: 409 } & { data: { length: number } })
  >()
  expectTypeOf<Awaited<ReturnType<typeof handler>>>().toEqualTypeOf<{
    ok: boolean
  }>()
  expectTypeOf<LegacyOptions['errors']>().toEqualTypeOf<
    readonly [typeof _legacy]
  >()
  expect(typeof handler).toBe('function')
})
