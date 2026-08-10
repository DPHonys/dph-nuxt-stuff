import { createEvent } from 'h3'
import type { H3Error, H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { createChannelStripHandler } from '../../src/runtime/server/lib/channel-strip'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared/wire'

/**
 * The response half of channel gating: the entry this module prepends to
 * Nitro's error-handler chain.
 *
 * The event is a **real** `H3Event` over fake node objects rather than a
 * hand-shaped stand-in, because every claim here is about h3's own helpers —
 * `getRequestHeader` reads a normalised header bag, `send` refuses to write
 * once `event.handled`, and "deferred" *means* nothing was written and the
 * chain runs on. A stubbed event would let the handler pass those tests by
 * accident.
 *
 * `defaultHandler` is likewise a fake, and its answer is Nitro's own measured
 * shape: `{ status, statusText, headers, body }` **returned, not sent** — which
 * is what lets a prepended entry render a modified body.
 */

const TOKEN = 'first-party'

/** What was written to the response, or `undefined` when nothing was. */
interface Sent {
  readonly status: number
  readonly statusMessage: string | undefined
  readonly headers: Record<string, string>
  readonly body: string | undefined
}

function fakeEvent(headers: Record<string, string> = {}): {
  event: H3Event
  sent: () => Sent
} {
  const written: { body?: string } = {}
  const setHeaders: Record<string, string> = {}

  const res = {
    statusCode: 200,
    statusMessage: undefined as string | undefined,
    writableEnded: false,
    headersSent: false,
    setHeader: (name: string, value: string) => {
      setHeaders[name] = value
    },
    getHeader: (name: string) => setHeaders[name],
    end: (body: string) => {
      written.body = body
      res.writableEnded = true
    },
  }

  const req = { method: 'GET', url: '/api/anything', headers }

  return {
    event: createEvent(req as never, res as never),
    sent: () => ({
      status: res.statusCode,
      statusMessage: res.statusMessage,
      headers: setHeaders,
      body: written.body,
    }),
  }
}

/** Nitro's prod builtin body, as measured, over whatever `data` is given. */
function prodBody(data: unknown): Record<string, unknown> {
  return {
    error: true,
    url: '/api/anything',
    statusCode: 403,
    statusMessage: 'Forbidden',
    message: 'nope',
    data,
  }
}

/** A `defaultHandler` fake answering one body; records that it was reached. */
function defaultHandlerFor(body: unknown) {
  const calls: unknown[] = []

  return {
    calls,
    defaultHandler: (error: unknown) => {
      calls.push(error)

      return {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'content-type': 'application/json' },
        body: body as string | Record<string, unknown>,
      }
    },
  }
}

/** The marker as the raise site builds it. */
const marker = { [KNOWN_ERROR_KEY]: { tag: 'forbidden', status: 403 } }

/**
 * Run the chain entry and answer what reached the builtin. `token` is `null`
 * for "the consumer configured none" — a sentinel rather than `undefined`, so
 * the configured case can stay the default.
 */
async function run(
  event: H3Event,
  error: unknown,
  body: unknown,
  token: string | null = TOKEN
) {
  const fake = defaultHandlerFor(body)

  await createChannelStripHandler(() => token ?? undefined)(
    error as H3Error,
    event,
    { defaultHandler: fake.defaultHandler as never }
  )

  return fake
}

describe('the tokenless, marked request', () => {
  it('answers the builtin’s body with the marker gone and the status line intact', async () => {
    const { event, sent } = fakeEvent()
    const error = { statusCode: 403, message: 'nope', data: marker }

    await run(event, error, prodBody(error.data))

    const body = JSON.parse(sent().body ?? 'null') as Record<string, unknown>

    // The status line is the builtin's, untouched: gating hides the *marker*,
    // not the failure.
    expect(sent().status).toBe(403)
    expect(sent().statusMessage).toBe('Forbidden')
    expect(sent().headers['content-type']).toBe('application/json')

    expect(body).toEqual({
      error: true,
      url: '/api/anything',
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'nope',
    })

    // `data` gone entirely rather than left as `{}`: the payload rides inside
    // the marker, so nothing else was ever in there.
    expect('data' in body).toBe(false)
  })

  it('never mutates the thrown error — observability sees every marker', async () => {
    // The Sentry-stability requirement, and the one assertion that would fail
    // for the obvious `delete body.data[KNOWN_ERROR_KEY]` implementation: the
    // serializer hands `error.data` through **by reference**, and `captureError`
    // has already fired by the time this runs.
    const { event } = fakeEvent()
    const data = { [KNOWN_ERROR_KEY]: { tag: 'forbidden', status: 403 } }
    const error = { statusCode: 403, message: 'nope', data }

    await run(event, error, prodBody(data))

    expect(error.data).toBe(data)
    expect(data).toEqual({
      [KNOWN_ERROR_KEY]: { tag: 'forbidden', status: 403 },
    })
  })

  it('keeps a consumer’s own sibling keys under data', async () => {
    const { event, sent } = fakeEvent()
    const data = { ...marker, trace: 'abc' }

    await run(event, { statusCode: 403, data }, prodBody(data))

    expect(JSON.parse(sent().body ?? 'null')).toMatchObject({
      data: { trace: 'abc' },
    })
  })

  it('strips the fetched-carrier depth too', async () => {
    // A rethrown carrier: the outer `data` is the callee's whole body, so the
    // marker sits one level deeper — the same two depths the recognizer reads.
    const { event, sent } = fakeEvent()
    const data = { error: true, statusCode: 403, data: marker }

    await run(event, { statusCode: 403, data }, prodBody(data))

    const body = JSON.parse(sent().body ?? 'null') as {
      data: Record<string, unknown>
    }

    expect(body.data).toEqual({ error: true, statusCode: 403 })
  })

  it('forwards dev’s stack, because dev is what the developer asked for', async () => {
    // The dev builtin's JSON body carries `stack`; a stripper that spreads
    // `res.body` forwards it — measured, and deliberate: this entry changes the
    // marker and nothing else about either builtin's answer.
    const { event, sent } = fakeEvent()
    const stack = ['at handler (server/api/x.ts:3:9)']

    await run(
      event,
      { statusCode: 403, data: marker },
      {
        ...prodBody(marker),
        stack,
      }
    )

    expect(JSON.parse(sent().body ?? 'null')).toMatchObject({ stack })
  })
})

describe('what the entry defers', () => {
  /** Deferred: nothing written, so the chain runs on to the builtin. */
  function expectDeferred(sent: Sent): void {
    expect(sent.body).toBeUndefined()
    expect(sent.status).toBe(200)
    expect(sent.headers).toEqual({})
  }

  it('a request carrying the token — the app’s own call gets the full wire', async () => {
    const { event, sent } = fakeEvent({ [CHANNEL_HEADER]: TOKEN })

    const fake = await run(
      event,
      { statusCode: 403, data: marker },
      prodBody(marker)
    )

    // The builtin is not even asked for a body: the entry returns before it.
    expect(fake.calls).toEqual([])
    expectDeferred(sent())
  })

  it('a foreign error, marked by nobody', async () => {
    const { event, sent } = fakeEvent()

    const fake = await run(
      event,
      { statusCode: 500, data: { detail: 'boom' } },
      prodBody({ detail: 'boom' })
    )

    expect(fake.calls).toEqual([])
    expectDeferred(sent())
  })

  it('a malformed marker, which reads as unknown everywhere else too', async () => {
    const { event, sent } = fakeEvent()
    const data = { [KNOWN_ERROR_KEY]: { tag: 7 } }

    await run(event, { statusCode: 403, data }, prodBody(data))

    expectDeferred(sent())
  })

  it('every request when no token is configured — gating off is today’s behaviour', async () => {
    const { event, sent } = fakeEvent()

    const fake = await run(
      event,
      { statusCode: 403, data: marker },
      prodBody(marker),
      null
    )

    expect(fake.calls).toEqual([])
    expectDeferred(sent())
  })

  it('a non-object body — the dev builtin’s HTML page has no data field', async () => {
    const { event, sent } = fakeEvent()

    await run(event, { statusCode: 403, data: marker }, '<html>youch</html>')

    expectDeferred(sent())
  })
})
