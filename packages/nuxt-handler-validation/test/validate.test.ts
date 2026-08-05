import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateDeclaredInput } from '../src/index'
import type { StandardSchemaV1, ValidationLocation } from '../src/index'

/**
 * The validation adapter's **runtime** behaviour — what an untrusted request
 * body is actually allowed to become. Ported verbatim from core's
 * `test/validation.test.ts` when the feature was parked.
 *
 * Everything hostile is here, because this is where hostile input is
 * arithmetic rather than a deployment: a malformed path, a symbol key, a
 * source that throws. The definer half lives in `./define.test.ts`.
 *
 * zod appears where the claim is *"a real Standard Schema library works
 * untouched"*. It is a devDependency and the package depends on no validator —
 * the spec's ~50 lines are inlined. The hand-rolled schemas below exist for
 * the corners no single library exercises: `{ key }` path segments, symbol
 * keys, an absent path, and an asynchronous `validate`.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CreateUser = z.object({
  name: z.string(),
  tags: z.array(z.object({ label: z.string() })),
})

const Paging = z.object({ page: z.coerce.number() })
const Params = z.object({ id: z.string() })

/** A schema that always fails, with issues written by hand. */
function failingWith(
  issues: readonly {
    message: string
    path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
  }[]
): StandardSchemaV1<unknown, never> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: () => ({ issues }),
    },
  }
}

/**
 * A schema that always fails with issues the spec's own types forbid.
 *
 * Separate from {@link failingWith} and cast on purpose: these shapes cannot be
 * written through the inlined types at all, which is the point — the adapter is
 * handed whatever a *consumer's* validator produces, and a validator is
 * ordinary third-party code.
 */
function hostileSchema(issues: unknown): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: () => ({ issues }),
    },
  } as unknown as StandardSchemaV1
}

/** A schema whose `validate` is genuinely asynchronous. */
function asyncSchema<Output>(value: Output): StandardSchemaV1<unknown, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: async () => Promise.resolve({ value }),
    },
  }
}

// ---------------------------------------------------------------------------
// The adapter, over an injected read
// ---------------------------------------------------------------------------

describe('validating the declared locations', () => {
  it('parses every declared location, reading each exactly once', async () => {
    const read: ValidationLocation[] = []

    const outcome = await validateDeclaredInput(
      { body: CreateUser, query: Paging, params: Params },
      (location) => {
        read.push(location)

        return {
          body: { name: 'ada', tags: [{ label: 'x' }] },
          query: { page: '2' },
          params: { id: '7' },
        }[location]
      }
    )

    expect(outcome.issues).toEqual([])
    expect(outcome.values).toEqual({
      body: { name: 'ada', tags: [{ label: 'x' }] },
      // Coerced, which is the half of "already parsed" h3 v2 cannot represent
      // at all: its query output is coerced back to string by construction.
      query: { page: 2 },
      params: { id: '7' },
    })
    expect(read).toEqual(['body', 'query', 'params'])
  })

  it('never reads a location the route did not declare', async () => {
    const read: ValidationLocation[] = []

    await validateDeclaredInput({ query: Paging }, (location) => {
      read.push(location)

      return { page: '1' }
    })

    // Not hygiene: `readBody` on a method h3 does not accept a body for is a
    // 405, so reading an undeclared body would turn a working GET route into a
    // broken one.
    expect(read).toEqual(['query'])
  })

  it('reports every location at once, body first', async () => {
    const outcome = await validateDeclaredInput(
      { body: CreateUser, query: Paging, params: Params },
      (location) =>
        ({
          body: { name: 42, tags: [] },
          query: { page: 'nope' },
          params: {},
        })[location]
    )

    // Fail-fast per source is rejected precisely for this: a caller fixing
    // `body`, resubmitting, and only then learning `query` was also wrong.
    expect(outcome.issues.map((issue) => issue.location)).toEqual([
      'body',
      'query',
      'params',
    ])
    expect(outcome.values).toEqual({})
  })

  it('normalises a nested path to segments, keeping array indices numeric', async () => {
    const outcome = await validateDeclaredInput({ body: CreateUser }, () => ({
      name: 'ada',
      tags: [{ label: 'ok' }, { label: 9 }],
    }))

    expect(outcome.issues).toEqual([
      {
        location: 'body',
        path: ['tags', 1, 'label'],
        message: expect.any(String),
      },
    ])
  })

  it('keeps a key containing a dot recoverable', async () => {
    // The whole argument against a dotted string, made against a key an
    // attacker chooses.
    const outcome = await validateDeclaredInput(
      { body: z.object({ 'a.b': z.string() }) },
      () => ({ 'a.b': 1 })
    )

    expect(outcome.issues[0]?.path).toEqual(['a.b'])
  })

  it('reports a whole-value failure with an empty path', async () => {
    const outcome = await validateDeclaredInput(
      { body: CreateUser },
      () => 'no'
    )

    expect(outcome.issues[0]?.path).toEqual([])
  })

  it('normalises segment objects, symbol keys and an absent path', async () => {
    const symbol = Symbol('secret')

    const outcome = await validateDeclaredInput(
      {
        body: failingWith([
          { message: 'whole value' },
          { message: 'segments', path: [{ key: 'items' }, { key: 3 }] },
          { message: 'symbol', path: [symbol] },
          { message: 'mixed', path: ['a', { key: 0 }, 'b'] },
        ]),
      },
      () => ({})
    )

    // Re-exporting the spec's own `Issue` was never available: its `path` is
    // `ReadonlyArray<PropertyKey | PathSegment>`, and `PropertyKey` includes
    // `symbol`, which through `Serialize` becomes a four-way union with nulls.
    // This is the normalisation that avoids it.
    expect(outcome.issues.map((issue) => issue.path)).toEqual([
      [],
      ['items', 3],
      ['Symbol(secret)'],
      ['a', 0, 'b'],
    ])
  })

  it('normalises a path full of junk rather than throwing inside the adapter', async () => {
    // Every entry here is legal JavaScript and illegal by the spec's types. A
    // throw in this function is a 500 where a 400 naming the bad field was
    // owed, and `typeof null === 'object'` is one `.key` away from exactly
    // that.
    const outcome = await validateDeclaredInput(
      {
        body: hostileSchema([
          { message: 'null segment', path: [null] },
          { message: 'undefined segment', path: [undefined] },
          { message: 'keyless object', path: [{ notKey: 1 }] },
          { message: 'path is not an array', path: { 0: 'a' } },
          { message: 'path is a number', path: 7 },
        ]),
      },
      () => ({})
    )

    expect(outcome.issues.map((issue) => issue.path)).toEqual([
      ['null'],
      ['undefined'],
      ['[object Object]'],
      [],
      [],
    ])
  })

  it.each([
    ['an empty issue list', []],
    ['an issue list that is not a list', 'oops'],
  ])('treats %s as a failure of the whole value', async (_label, issues) => {
    // `{ issues: [] }` is a failure by the spec's own discriminant and reports
    // nothing wrong. Reported as nothing wrong it would let the handler run
    // with `body` undefined behind a type that says "already parsed" — the one
    // outcome this surface exists to make unrepresentable.
    const outcome = await validateDeclaredInput(
      { body: hostileSchema(issues) },
      () => ({})
    )

    expect(outcome.issues).toEqual([
      { location: 'body', path: [], message: 'The request body is invalid.' },
    ])
    expect(outcome.values).toEqual({})
  })

  it('keeps a prototype-polluting key an ordinary segment, and pollutes nothing', async () => {
    const outcome = await validateDeclaredInput(
      {
        // Both spellings an attacker reaches for, declared as fields so the key
        // really does travel through the schema and out onto a path. The
        // computed key is not decoration: written plainly, `__proto__:` in an
        // object literal sets the prototype instead of defining a field, so the
        // schema would silently not have one.
        body: z.object({
          ['__proto__']: z.object({ polluted: z.string() }),
          constructor: z.string(),
        }),
      },
      () => JSON.parse('{"__proto__":{"polluted":true},"constructor":42}')
    )

    expect(outcome.issues.map((issue) => issue.path)).toEqual([
      ['__proto__', 'polluted'],
      ['constructor'],
    ])

    // The segments are data on a plain array, and nothing on the way here
    // assigned through one.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('turns a source it cannot read into one issue, and keeps going', async () => {
    const outcome = await validateDeclaredInput(
      { body: CreateUser, query: Paging },
      (location) => {
        if (location === 'body') throw new Error('malformed')

        return { page: 'nope' }
      }
    )

    expect(outcome.issues).toEqual([
      {
        location: 'body',
        path: [],
        message: 'The request body could not be read.',
      },
      { location: 'query', path: ['page'], message: expect.any(String) },
    ])
  })

  it('awaits a schema whose validate is asynchronous', async () => {
    const outcome = await validateDeclaredInput(
      { query: asyncSchema({ page: 3 }) },
      () => ({})
    )

    // The promise arm is on `validate` for *every* schema, synchronous ones
    // included, so the adapter always awaits. Without the await this value
    // would be a `Promise` and `issues` would be `undefined`.
    expect(outcome.values).toEqual({ query: { page: 3 } })
    expect(outcome.issues).toEqual([])
  })
})
