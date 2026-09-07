import { createApp, createError, eventHandler, toPlainHandler } from 'h3'
import type { H3Error, PlainResponse } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createChannelStripHandler } from '../../src/runtime/server/lib/channel-strip'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared/wire'

// The response half of channel gating. The chain entry runs inside a real h3
// app over h3's own plain-request adapter, because every claim here is about
// h3's own helpers; `defaultHandler` fakes Nitro's measured shape - `{ status,
// statusText, headers, body }` returned, not sent.

const TOKEN = 'first-party'

/** The error's `data` as a route or a consumer would set it - any JSON object. */
interface ErrorData {
  [key: string]: string | number | boolean | ErrorData
}

/** Nitro's prod builtin body, as measured; dev adds the stack. */
interface BuiltinJsonBody {
  error: true
  url: string
  statusCode: number
  statusMessage: string
  message: string
  data: ErrorData
  stack?: readonly string[]
}

/** The body the builtin answers: Nitro's measured shape, or dev's HTML page. */
type BuiltinBody = BuiltinJsonBody | string

/** Nitro's prod builtin body, as measured, over whatever `data` is given. */
function prodBody(data: ErrorData): BuiltinJsonBody {
  return {
    error: true,
    url: '/api/anything',
    statusCode: 403,
    statusMessage: 'Forbidden',
    message: 'nope',
    data,
  }
}

/** The thrown error as h3 makes it - the shape the chain entry receives. */
function thrown(input: {
  statusCode: number
  message?: string
  data: ErrorData
}): H3Error {
  return createError(input)
}

/** The marker as the raise site builds it. */
const marker = { [KNOWN_ERROR_KEY]: { tag: 'forbidden', status: 403 } }

/** What the entry answered: the builtin's calls, and what went on the wire. */
interface Outcome {
  readonly builtinCalls: readonly H3Error[]
  readonly response: PlainResponse
}

/** The sentinel the app sends when the entry returned without writing. */
const DEFERRED = 'deferred'

/**
 * Run the chain entry for one request and answer what reached the builtin
 * and what went out. `token` is `null` for "the consumer configured none".
 */
async function run(
  error: H3Error,
  body: BuiltinBody,
  options: { headers?: Record<string, string>; token?: string | null } = {}
): Promise<Outcome> {
  const builtinCalls: H3Error[] = []
  const token = options.token === undefined ? TOKEN : options.token

  const defaultHandler = (thrownError: H3Error) => {
    builtinCalls.push(thrownError)

    return {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'content-type': 'application/json' },
      body,
    }
  }

  const app = createApp().use(
    eventHandler(async (event) => {
      await createChannelStripHandler(() => token ?? undefined)(error, event, {
        defaultHandler,
      })

      // A deferring entry writes nothing, so the app itself answers.
      return event.handled ? undefined : DEFERRED
    })
  )

  const response = await toPlainHandler(app)({
    method: 'GET',
    path: '/api/anything',
    headers: options.headers ?? {},
  })

  return { builtinCalls, response }
}

// What went on the wire, read back as the prod builtin's own shape.
const sentBodySchema = z.looseObject({
  data: z.looseObject({}).optional(),
  stack: z.array(z.string()).optional(),
})

function parseBody(response: PlainResponse) {
  return sentBodySchema.parse(JSON.parse(String(response.body)))
}

describe('the tokenless, marked request', () => {
  it('answers the builtin’s body with the marker gone and the status line intact', async () => {
    const error = thrown({ statusCode: 403, message: 'nope', data: marker })

    const { response } = await run(error, prodBody(marker))

    const body = parseBody(response)

    // Gating hides the *marker*, not the failure.
    expect(response.status).toBe(403)
    expect(response.statusText).toBe('Forbidden')
    expect(Object.fromEntries(response.headers)['content-type']).toBe(
      'application/json'
    )

    expect(body).toEqual({
      error: true,
      url: '/api/anything',
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'nope',
    })

    // `data` gone entirely rather than left as `{}`.
    expect('data' in body).toBe(false)
  })

  it('never mutates the thrown error - observability sees every marker', async () => {
    // The serializer hands `error.data` through by reference, and
    // `captureError` has already fired by the time this runs - so the obvious
    // `delete body.data[KNOWN_ERROR_KEY]` implementation would break Sentry.
    const data = { [KNOWN_ERROR_KEY]: { tag: 'forbidden', status: 403 } }
    const error = thrown({ statusCode: 403, message: 'nope', data })

    await run(error, prodBody(data))

    expect(error.data).toBe(data)
    expect(data).toEqual({
      [KNOWN_ERROR_KEY]: { tag: 'forbidden', status: 403 },
    })
  })

  it('keeps a consumer’s own sibling keys under data', async () => {
    const data = { ...marker, trace: 'abc' }

    const { response } = await run(
      thrown({ statusCode: 403, data }),
      prodBody(data)
    )

    expect(parseBody(response)).toMatchObject({ data: { trace: 'abc' } })
  })

  it('strips the fetched-carrier depth too', async () => {
    // A rethrown carrier: the marker sits one level deeper - the same two
    // depths the recognizer reads.
    const data = { error: true, statusCode: 403, data: marker }

    const { response } = await run(
      thrown({ statusCode: 403, data }),
      prodBody(data)
    )

    expect(parseBody(response).data).toEqual({ error: true, statusCode: 403 })
  })

  it('forwards dev’s stack, because dev is what the developer asked for', async () => {
    const stack = ['at handler (server/api/x.ts:3:9)']

    const { response } = await run(thrown({ statusCode: 403, data: marker }), {
      ...prodBody(marker),
      stack,
    })

    expect(parseBody(response)).toMatchObject({ stack })
  })
})

/** Deferred: nothing written by the entry, so the app answered instead. */
function expectDeferred(response: PlainResponse): void {
  expect(response.status).toBe(200)
  expect(response.body).toBe(DEFERRED)
}

describe('what the entry defers', () => {
  it('a request carrying the token - the app’s own call gets the full wire', async () => {
    const { builtinCalls, response } = await run(
      thrown({ statusCode: 403, data: marker }),
      prodBody(marker),
      { headers: { [CHANNEL_HEADER]: TOKEN } }
    )

    // The builtin is not even asked for a body: the entry returns before it.
    expect(builtinCalls).toEqual([])
    expectDeferred(response)
  })

  it('a foreign error, marked by nobody', async () => {
    const { builtinCalls, response } = await run(
      thrown({ statusCode: 500, data: { detail: 'boom' } }),
      prodBody({ detail: 'boom' })
    )

    expect(builtinCalls).toEqual([])
    expectDeferred(response)
  })

  it('a malformed marker, which reads as unknown everywhere else too', async () => {
    const data = { [KNOWN_ERROR_KEY]: { tag: 7 } }

    const { response } = await run(
      thrown({ statusCode: 403, data }),
      prodBody(data)
    )

    expectDeferred(response)
  })

  it('every request when no token is configured - gating off is today’s behaviour', async () => {
    const { builtinCalls, response } = await run(
      thrown({ statusCode: 403, data: marker }),
      prodBody(marker),
      { token: null }
    )

    expect(builtinCalls).toEqual([])
    expectDeferred(response)
  })

  it('a non-object body - the dev builtin’s HTML page has no data field', async () => {
    const { response } = await run(
      thrown({ statusCode: 403, data: marker }),
      '<html>youch</html>'
    )

    expectDeferred(response)
  })
})
