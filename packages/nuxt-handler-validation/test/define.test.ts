import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/server'
import { DECLARED_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import { createEvent } from 'h3'
import type { EventHandler, H3Event } from 'h3'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler, invalidInput } from '../src/index'
import type { ValidationIssue } from '../src/index'

/**
 * The layered definer over a real `H3Event` — the only place the three h3
 * reads, the marked/unmarked decision and the swappable status are observable
 * at all. Ported from core's `test/validation.test.ts` when the feature was
 * parked; the adapter half is `./validate.test.ts`.
 *
 * Known gap, stated rather than hidden: core's suite also proved the same
 * failure crosses a real network (`test/wire.test.ts` against a built
 * playground). This package has no playground, so the wire half is untested
 * until the package is admitted.
 */

const CreateUser = z.object({
  name: z.string(),
  tags: z.array(z.object({ label: z.string() })),
})

const Paging = z.object({ page: z.coerce.number() })
const Params = z.object({ id: z.string() })

describe('a validated handler that declares schemas', () => {
  it('hands the handler the parsed input, flat', async () => {
    let seen: unknown

    const handler = defineValidatedEventHandler(
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
    const handler = defineValidatedEventHandler(
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
      // never escalates this to the global error page.
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

    const handler = defineValidatedEventHandler(
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
    const handler = defineValidatedEventHandler(
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

    const handler = defineValidatedEventHandler(
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

    const handler = defineValidatedEventHandler(
      { errors: [appValidation], body: CreateUser },
      async (_event, { body }) => ({ name: body.name })
    )

    const thrown = await catchThrown(
      handler,
      eventFor({ method: 'POST', url: '/api/users', json: { name: 42 } })
    )

    // The definer raises through the route's own `fail`, which resolves the
    // status off the *composed catalogues at run time* — so an app
    // standardising on 422 needs no option and no flag: it declares its own
    // catalogue with the same tag and lists that instead.
    expect(thrown).toMatchObject({
      statusCode: 422,
      data: {
        [DECLARED_ERROR_KEY]: { tag: 'invalid-input', status: 422 },
      },
    })
  })

  it('leaves a route that declares no schema entirely alone', async () => {
    const handler = defineValidatedEventHandler(
      { errors: [invalidInput] },
      async () => ({ ok: true })
    )

    // A GET event with no body at all. If the definer read one anyway, h3's
    // `assertMethod` would answer 405 — so this is the observation that the
    // no-schema path never enters the adapter.
    expect(await handler(eventFor({ url: '/api/ping' }))).toEqual({ ok: true })
  })

  it('reports a body h3 refuses to read as one issue, masking h3’s 405', async () => {
    const handler = defineValidatedEventHandler(
      { errors: [invalidInput], body: CreateUser },
      async (_event, { body }) => ({ name: body.name })
    )

    // A route declaring `body` on a request h3 will not read one for. The cost
    // of the one-channel rule is visible here and is stated rather than hidden:
    // h3's own answer is a **405**, and it arrives at the client as this
    // package's 400. That trade is deliberate — the alternative is that a body
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

/** What a handler threw, insisting that it threw at all. */
async function catchThrown(
  handler: EventHandler,
  event: H3Event
): Promise<unknown> {
  try {
    await handler(event)
  } catch (error) {
    return error
  }

  throw new Error('expected the handler to throw')
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
