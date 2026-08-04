import { createEvent } from 'h3'
import type { EventHandler, H3Event } from 'h3'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  DECLARED_ERROR_KEY,
  defineErrors,
  defineTypedEventHandler,
  invalidInput,
  payload,
} from '../src/runtime/shared'
import type {
  StandardSchemaV1,
  ValidationIssue,
  ValidationLocation,
} from '../src/runtime/types'
import { validateDeclaredInput } from '../src/runtime/validation'
import { settled } from './failure-channel'

/**
 * The validation adapter's **runtime** behaviour (SPEC.md §3.3) — what an
 * untrusted request body is actually allowed to become.
 *
 * Two surfaces, split where the module splits:
 *
 * - `validateDeclaredInput`, over an injected `read`. Everything hostile is
 *   here, because this is where hostile input is arithmetic rather than a
 *   deployment: a malformed path, a symbol key, a source that throws.
 * - `defineTypedEventHandler` over a real `H3Event`, which is the only place
 *   the three h3 reads, the marked/unmarked decision and the swappable status
 *   are observable at all. `test/wire.test.ts` proves the same failure crosses
 *   a real network; this file proves the decisions behind it.
 *
 * zod appears where the claim is *"a real Standard Schema library works
 * untouched"*. It is a devDependency and the module depends on no validator —
 * the spec's ~50 lines are inlined (SPEC.md §3.3). The hand-rolled schemas
 * below exist for the corners no single library exercises: `{ key }` path
 * segments, symbol keys, an absent path, and an asynchronous `validate`.
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
      // at all: its query output is coerced back to string by construction
      // (SPEC.md §7.4).
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

    // SPEC.md §11.4 rejects fail-fast per source precisely for this: a caller
    // fixing `body`, resubmitting, and only then learning `query` was also
    // wrong.
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
    // SPEC.md §11.4's whole argument against a dotted string, made against a
    // key an attacker chooses.
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
    // `symbol`, which through `Serialize` becomes a four-way union with nulls
    // (SPEC.md §11.4). This is the normalisation that avoids it.
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

// ---------------------------------------------------------------------------
// The definer, over a real h3 event
// ---------------------------------------------------------------------------

describe('a typed handler that declares schemas', () => {
  it('hands the handler the parsed input, flat', async () => {
    let seen: unknown

    const handler = defineTypedEventHandler(
      {
        errors: [invalidInput],
        body: CreateUser,
        query: Paging,
        params: Params,
      },
      async (_event, { body, query, params }) => {
        seen = { body, query, params }

        return { name: body.name, page: query.page, id: params.id }
      }
    )

    const result = await handler(
      eventFor({
        method: 'POST',
        url: '/api/users/7?page=2',
        json: { name: 'ada', tags: [{ label: 'x' }], role: 'admin' },
        params: { id: '7' },
      })
    )

    expect(result).toEqual({ name: 'ada', page: 2, id: '7' })

    // The handler sees the schema's **output**, not the request. `role` was in
    // the body and is gone, which is the difference between validating and
    // asserting.
    expect(seen).toEqual({
      body: { name: 'ada', tags: [{ label: 'x' }] },
      query: { page: 2 },
      params: { id: '7' },
    })
  })

  it('raises the declared variant, with every issue on it', async () => {
    const handler = defineTypedEventHandler(
      { errors: [invalidInput], body: CreateUser, query: Paging },
      async (_event, { body }) => ({ name: body.name })
    )

    const thrown = await catchThrown(
      handler,
      eventFor({
        method: 'POST',
        url: '/api/users?page=nope',
        json: { name: 42, tags: [] },
      })
    )

    expect(thrown).toMatchObject({
      statusCode: 400,
      statusMessage: 'invalid-input',
      // Left alone, so Nitro's production serializer keeps `data` and Nuxt
      // never escalates this to the global error page (SPEC.md §5.1).
      fatal: false,
      unhandled: false,
      data: {
        [DECLARED_ERROR_KEY]: { tag: 'invalid-input', status: 400 },
      },
    })

    expect(markerIssues(thrown).map((issue) => issue.location)).toEqual([
      'body',
      'query',
    ])
  })

  it('never runs the handler when validation fails', async () => {
    let ran = false

    const handler = defineTypedEventHandler(
      { errors: [invalidInput], body: CreateUser },
      async (_event, { body }) => {
        ran = true

        return { name: body.name }
      }
    )

    await catchThrown(
      handler,
      eventFor({ method: 'POST', url: '/api/users', json: { name: 42 } })
    )

    expect(ran).toBe(false)
  })

  it('answers a malformed JSON body with the declared variant, not h3’s own 400', async () => {
    const handler = defineTypedEventHandler(
      { errors: [invalidInput], body: CreateUser },
      async (_event, { body }) => ({ name: body.name })
    )

    // Hostile: `readBody` turns this into its own unmarked 400 ("Invalid JSON
    // body"). Letting that escape would mean a wrong-shaped body is a
    // *declared* failure and a non-JSON body is an *undeclared* one — the same
    // mistake, reported through two different channels.
    const thrown = await catchThrown(
      handler,
      eventFor({
        method: 'POST',
        url: '/api/users',
        raw: '{"name": "ada",',
      })
    )

    expect(thrown).toMatchObject({ statusCode: 400 })
    expect(markerIssues(thrown)).toEqual([
      {
        location: 'body',
        path: [],
        message: 'The request body could not be read.',
      },
    ])
  })

  it('throws unmarked when the route did not list a catalogue for it', async () => {
    const authErrors = defineErrors({ unauthorized: { status: 401 } })

    const handler = defineTypedEventHandler(
      { errors: [authErrors], body: CreateUser },
      async (_event, { body }) => ({ name: body.name })
    )

    const thrown = await catchThrown(
      handler,
      eventFor({ method: 'POST', url: '/api/users', json: { name: 42 } })
    )

    // Opting out is free and needs no machinery: validation still runs and
    // still 400s, the failure lands in the ordinary Nuxt channel, and the
    // union this route published matches its `errors: [...]` exactly.
    expect(thrown).toMatchObject({ statusCode: 400 })
    expect(marker(thrown)).toBeUndefined()

    // The issues are still there, one hop shallower — an unmarked failure is
    // no less machine-readable, it is simply not one this route declared, so
    // `declaredError` answers `undefined` for it.
    expect(dataOf(thrown)?.issues).toMatchObject([
      { location: 'body', path: ['name'] },
      { location: 'body', path: ['tags'] },
    ])
  })

  it('raises the app’s own variant, at the app’s own status', async () => {
    const appValidation = defineErrors({
      'invalid-input': {
        status: 422,
        payload: payload<{ issues: ValidationIssue[] }>(),
      },
    })

    const handler = defineTypedEventHandler(
      { errors: [appValidation], body: CreateUser },
      async (_event, { body }) => ({ name: body.name })
    )

    const thrown = await catchThrown(
      handler,
      eventFor({ method: 'POST', url: '/api/users', json: { name: 42 } })
    )

    // The definer reads the status off the *composed catalogues at run time*,
    // so an app standardising on 422 needs no module option and no flag — it
    // declares its own catalogue with the same tag and lists that instead.
    expect(thrown).toMatchObject({
      statusCode: 422,
      data: {
        [DECLARED_ERROR_KEY]: { tag: 'invalid-input', status: 422 },
      },
    })
  })

  it('leaves a route that declares no schema entirely alone', async () => {
    const handler = defineTypedEventHandler(
      { errors: [invalidInput] },
      async () => ({ ok: true })
    )

    // A GET event with no body at all. If the definer read one anyway, h3's
    // `assertMethod` would answer 405 — so this is the observation that the
    // no-schema path never enters the adapter.
    expect(await handler(eventFor({ url: '/api/ping' }))).toEqual({ ok: true })
  })

  it('reports a body h3 refuses to read as one issue, masking h3’s 405', async () => {
    const handler = defineTypedEventHandler(
      { errors: [invalidInput], body: CreateUser },
      async (_event, { body }) => ({ name: body.name })
    )

    // A route declaring `body` on a request h3 will not read one for. The cost
    // of the one-channel rule is visible here and is stated rather than hidden:
    // h3's own answer is a **405**, and it arrives at the client as this
    // module's 400. That trade is deliberate — the alternative is that a body
    // of the wrong shape is a *declared* failure while a body h3 could not read
    // at all is an *undeclared* one, i.e. the same client mistake reported
    // through two different channels — and the case it costs is a route-author
    // mistake rather than a caller's.
    const thrown = await catchThrown(handler, eventFor({ url: '/api/users' }))

    expect(thrown).toMatchObject({ statusCode: 400 })
    expect(markerIssues(thrown)).toEqual([
      {
        location: 'body',
        path: [],
        message: 'The request body could not be read.',
      },
    ])
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EventInit {
  method?: string
  url?: string
  /** Sent as `application/json`. */
  json?: unknown
  /** Sent as `application/json` verbatim, malformed or not. */
  raw?: string
  params?: Record<string, string>
}

/**
 * A real `H3Event` over a hand-built request.
 *
 * `createEvent` only parks `req`/`res` on the event, and the three utilities
 * this surface uses read `node.req` (`readBody`), `event.path` (`getQuery`) and
 * `event.context.params` (`getRouterParams`) — so a plain object is the whole
 * of what a request has to be here, and the utilities under test are h3's real
 * ones rather than doubles.
 */
function eventFor(init: EventInit): H3Event {
  const body =
    init.raw ??
    (init.json === undefined ? undefined : JSON.stringify(init.json))

  const req = {
    method: init.method ?? 'GET',
    url: init.url ?? '/',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body,
  } as unknown as IncomingMessage

  const event = createEvent(req, {} as ServerResponse)
  if (init.params !== undefined) event.context.params = init.params

  return event
}

/**
 * What a handler threw, insisting that it threw at all.
 *
 * Built on `settled` rather than on its own `try`/`catch`, because
 * `test/failure-channel.ts` already owns that shape for the two fetch-wrapper
 * suites and a second copy can drift while both keep passing. The insistence is
 * this file's own: a validation failure that quietly *resolved* would satisfy
 * every `toMatchObject` below on an `undefined`.
 */
async function catchThrown(
  handler: EventHandler,
  event: H3Event
): Promise<unknown> {
  const outcome = await settled(async () => handler(event))

  if (!outcome.threw) throw new Error('expected the handler to throw')

  return outcome.value
}

function dataOf(thrown: unknown): Record<string, unknown> | undefined {
  return (thrown as { data?: Record<string, unknown> }).data
}

function marker(thrown: unknown): Record<string, unknown> | undefined {
  return dataOf(thrown)?.[DECLARED_ERROR_KEY] as
    | Record<string, unknown>
    | undefined
}

function markerIssues(thrown: unknown): ValidationIssue[] {
  return (marker(thrown)?.issues ?? []) as ValidationIssue[]
}
