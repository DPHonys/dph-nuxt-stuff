import type { H3Error } from 'h3'
import { expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  defineCheckedEventHandler,
  defineError,
} from '../../src/runtime/server'
import type {
  AnyKnownError,
  ErrorFactories,
  HandlerContext,
  KnownErrorsOf,
  KnownErrorsOfHandler,
} from '../../src/runtime/types'
import type { PayloadArgs } from '../../src/runtime/types/known-error'

const group = defineError({
  notFound: { status: 404 },
  conflict: {
    status: 409,
    payload: z.string().transform((value) => ({ length: value.length })),
  },
  numbered: {
    status: 400,
    payload: z.number().transform((value) => ({ value: String(value) })),
  },
  empty: { status: 400, payload: z.object({}) },
  union: {
    status: 400,
    payload: z
      .string()
      .transform((value) =>
        value.length
          ? { kind: 'text' as const, text: value }
          : { kind: 'empty' as const, empty: true }
      ),
  },
  objectUnion: {
    status: 400,
    payload: z.union([
      z.object({ text: z.string() }),
      z.object({ count: z.number() }),
    ]),
  },
})
const single = defineError('single', {
  status: 403,
  payload: z.string().transform((value) => ({ value: Number(value) })),
})
const unionSingle = defineError('unionSingle', {
  status: 400,
  payload: z.union([
    z.object({ kind: z.literal('text'), text: z.string() }),
    z.object({ kind: z.literal('count'), count: z.number() }),
  ]),
})
const declarations = [
  ...group.pick(
    'conflict',
    'notFound',
    'numbered',
    'empty',
    'union',
    'objectUnion'
  ),
  single,
  unionSingle,
  unionSingle,
  defineError('bare', { status: 400 }),
]

const handler = defineCheckedEventHandler(
  { errors: declarations },
  (_event, context) => {
    expectTypeOf(context).toEqualTypeOf<HandlerContext<typeof declarations>>()
    expectTypeOf(context.errors).toEqualTypeOf<
      ErrorFactories<typeof declarations>
    >()
    expectTypeOf(context.errors.notFound()).toEqualTypeOf<H3Error>()
    context.errors.conflict('input')
    context.errors.single('42')
    context.errors.numbered(42)
    context.errors.empty({})
    context.errors.bare()
    context.errors.union('input')
    context.errors.unionSingle({ kind: 'text', text: 'input' })
    context.errors.unionSingle({ kind: 'count', count: 1 })
    // @ts-expect-error union discriminants retain their associated fields
    context.errors.unionSingle({ kind: 'text', count: 1 })
    context.errors.objectUnion({ text: 'input' })
    context.errors.objectUnion({ count: 1 })
    const unionInput: { text: string } | { count: number } = Math.random()
      ? { text: 'input' }
      : { count: 1 }
    context.errors.objectUnion(unionInput)
    // @ts-expect-error disjoint union payloads still require an argument
    context.errors.objectUnion()
    // @ts-expect-error every union member requires its payload fields
    context.errors.objectUnion({})
    // @ts-expect-error schema union output is not its input
    context.errors.union({ kind: 'text', text: 'input' })
    // @ts-expect-error undeclared factory
    context.errors.missing()
    // @ts-expect-error zero arguments for a no-payload factory
    context.errors.notFound({})
    // @ts-expect-error schema input required
    context.errors.conflict()
    // @ts-expect-error transformed input is not its output, even after pick
    context.errors.conflict({ length: 1 })
    // @ts-expect-error single retains input too
    context.errors.single({ value: 42 })
    // @ts-expect-error transformed inputs survive a group pick
    context.errors.numbered({ value: '42' })
    // @ts-expect-error empty schema input is still required
    context.errors.empty()
    // @ts-expect-error a definition without a payload takes no argument
    context.errors.bare({})
    // @ts-expect-error a definition without a payload takes no argument
    context.errors.bare(undefined)
    return { ok: true }
  }
)

export function declarationGuards(): void {
  // @ts-expect-error data is not a definition slot
  defineError('bad', { status: 404, data: z.object({}) })
  // @ts-expect-error open records could overwrite the reserved fields
  defineError('bad', { status: 404, payload: z.record(z.string(), z.string()) })
  // @ts-expect-error inline records are not supported
  defineCheckedEventHandler({ errors: { bad: { status: 404 } } }, () => null)
  // @ts-expect-error schema output must be an object
  defineError('bad', { status: 404, payload: z.string() })
  // @ts-expect-error array output cannot be flattened
  defineError('bad', { status: 404, payload: z.array(z.string()) })
  // @ts-expect-error reserved output field
  defineError('bad', { status: 404, payload: z.object({ tag: z.string() }) })
  // @ts-expect-error reserved output field in a group
  defineError({
    bad: { status: 404, payload: z.object({ status: z.number() }) },
  })
  // @ts-expect-error the payload must be a Standard Schema, not a plain type
  defineError('bad', { status: 404, payload: {} as { until: string } })
  // @ts-expect-error `__invalidTag__` names the kebab tag on a single
  defineError('not-found', { status: 404 })
  // @ts-expect-error `__invalidTag__` names the kebab tag in a group
  defineError({ 'not-found': { status: 404 } })
  // @ts-expect-error nested bigint must survive serialization
  defineError('bad', {
    status: 404,
    payload: z.object({
      rows: z.array(z.object({ amount: z.bigint().optional() })),
    }),
  })
  // @ts-expect-error every output union branch must be valid
  defineError('bad', {
    status: 404,
    payload: z.union([
      z.object({ ok: z.string() }),
      z.object({ nested: z.object({ value: z.symbol() }) }),
    ]),
  })
  // @ts-expect-error callbacks do not survive serialization
  defineError('bad', {
    status: 404,
    payload: z.string().transform(() => ({ callback: () => 1 })),
  })
  // @ts-expect-error symbols are not wire tags
  defineError({ [Symbol('tag')]: { status: 404 } })

  const conflicting = defineError('conflict', {
    status: 409,
    payload: z.number().transform((value) => ({ length: value })),
  })
  defineCheckedEventHandler(
    // @ts-expect-error same output but divergent schema input
    { errors: [...group.pick('conflict'), conflicting] },
    () => null
  )
  const narrower = defineError('conflict', {
    status: 409,
    payload: z.literal('only').transform((value) => ({ length: value.length })),
  })
  defineCheckedEventHandler(
    // @ts-expect-error input subtypes must not silently collapse either
    { errors: [...group.pick('conflict'), narrower] },
    () => null
  )
  const differentOutput = defineError('conflict', {
    status: 409,
    payload: z
      .string()
      .transform((value) => ({ length: value.length, extra: true })),
  })
  defineCheckedEventHandler(
    // @ts-expect-error same input but a structurally narrower output still conflicts
    { errors: [...group.pick('conflict'), differentOutput] },
    () => null
  )
  const differentStatus = defineError('conflict', {
    status: 400,
    payload: z.string().transform((value) => ({ length: value.length })),
  })
  defineCheckedEventHandler(
    // @ts-expect-error the declaration metadata must retain the status too
    { errors: [...group.pick('conflict'), differentStatus] },
    () => null
  )
  interface Node {
    value: string
    children: Node[]
  }
  const recursive: z.ZodType<Node> = z.lazy(() =>
    z.object({ value: z.string(), children: z.array(recursive) })
  )
  defineError('recursive', { status: 409, payload: recursive })
}

type Options = Parameters<
  typeof defineCheckedEventHandler<readonly [typeof single], string>
>[0]

function defineUmbrella<const A extends readonly AnyKnownError[], Response>(
  options: Parameters<typeof defineCheckedEventHandler<A, Response>>[0],
  callback: (context: HandlerContext<A>) => Response
) {
  return defineCheckedEventHandler(options, (_event, context) =>
    callback(context)
  )
}

const umbrella = defineUmbrella({ errors: declarations }, ({ errors }) => {
  if (Math.random() > 0.5) throw errors.conflict('input')
  return { ok: true }
})

it('preserves output brands, success inference, and the generic composition seam', () => {
  expectTypeOf<
    PayloadArgs<KnownErrorsOf<typeof declarations>, 'objectUnion'>
  >().toEqualTypeOf<[payload: { text: string } | { count: number }]>()
  expectTypeOf<
    PayloadArgs<KnownErrorsOf<typeof declarations>, 'bare'>
  >().toEqualTypeOf<[]>()
  type Discriminated = { tag: 'union'; status: 400 } & (
    | { kind: 'text'; text: string }
    | { kind: 'count'; count: number }
  )
  expectTypeOf<PayloadArgs<Discriminated, 'union'>>().toEqualTypeOf<
    [payload: { kind: 'text'; text: string } | { kind: 'count'; count: number }]
  >()
  expectTypeOf<KnownErrorsOfHandler<typeof handler>>().toEqualTypeOf<
    KnownErrorsOf<typeof declarations>
  >()
  expectTypeOf<
    Extract<KnownErrorsOf<typeof declarations>, { tag: 'conflict' }>
  >().toEqualTypeOf<{ tag: 'conflict'; status: 409 } & { length: number }>()
  expectTypeOf<Awaited<ReturnType<typeof handler>>>().toEqualTypeOf<{
    ok: boolean
  }>()
  expectTypeOf<Options['errors']>().toEqualTypeOf<readonly [typeof single]>()
  expectTypeOf<KnownErrorsOfHandler<typeof umbrella>>().toEqualTypeOf<
    KnownErrorsOf<typeof declarations>
  >()
  expectTypeOf<Awaited<ReturnType<typeof umbrella>>>().toEqualTypeOf<{
    ok: boolean
  }>()
  expect(typeof handler).toBe('function')
  expect(typeof umbrella).toBe('function')
})
