import type { NitroFetchRequest } from 'nitropack/types'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createCheckedEventFetch,
  EventFetchUnavailableError,
} from '../../src/runtime/server/lib/event-checked-fetch'
import type { RawEventFetch } from '../../src/runtime/server/lib/event-checked-fetch'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import { knownFailure, settled } from '../fetch-channel'

// The run-time half of `event.$checkedFetch`. The fake here deliberately
// differs from `checked-fetch.test.ts`'s: this surface sits on h3's
// `fetchWithEvent` (h3@1.15.11), which merges headers by object spread -
// `{ ...getProxyRequestHeaders(event), ...init?.headers }` - so every
// assertion is on what would go on the wire *after* that spread. Asserting on
// the handed-over value would make the headline header bug read as a pass.

/** Whatever `event.$fetch` would accept; only `headers` is read here. */
interface EventFetchInit {
  headers?: HeadersInit
}

// h3 forwards the incoming request's headers via `getProxyRequestHeaders`.
// `accept` is deliberately not among them: h3 lists it in `ignoredHeaders`,
// which is why this surface needs a presence check, not the global's
// three-way one.
const FORWARDED = {
  cookie: 'session=abc',
  'user-agent': 'probe',
}

/**
 * What h3's spread leaves: the forwarded set with the caller's headers spread
 * over it - whatever shape that spread really produces, which is the point.
 */
const spreadLikeH3 = (headers: HeadersInit | undefined) => ({
  ...FORWARDED,
  ...headers,
})

type Spread = ReturnType<typeof spreadLikeH3>

/** One call as it reached the event's fetch. */
interface Recorded {
  readonly request: NitroFetchRequest
  /** Exactly what the wrapper handed on, unresolved. */
  readonly init: EventFetchInit | undefined
  /** What h3's spread would put on the wire. */
  readonly sent: Spread
}

const calls: Recorded[] = []

/** What the fake resolves with: a body, as the fetch underneath decided. */
type Body = string | { id: string }

/** What the fake does next: resolve with this, or reject with it. */
let outcome: { resolve: Body } | { reject: unknown } = { resolve: 'ok' }

/** `event.$fetch`, modelling h3's single-spread header merge. */
function fakeEventFetch(): RawEventFetch<Body> {
  return (request, init) => {
    calls.push({
      request,
      init,
      sent: spreadLikeH3(init?.headers),
    })

    return 'reject' in outcome
      ? Promise.reject(outcome.reject)
      : Promise.resolve(outcome.resolve)
  }
}

/** The headers that would go on the wire for the last call. */
function sentHeaders(): Spread {
  const last = calls.at(-1)

  if (last === undefined) throw new Error('nothing reached the event fetch')

  return last.sent
}

beforeEach(() => {
  calls.length = 0
  outcome = { resolve: 'ok' }
})

describe('the header merge - the EVENT-BOUND form', () => {
  // Every row asserts the whole header set that would go on the wire.
  // Row 2 is the headline: a `Headers` instance spreads to nothing, dropping
  // the caller's headers and this module's `accept` together; a tuple array
  // spreads to `{"0": …}` and is corrupted outright.
  const inputs: readonly [
    name: string,
    headers: HeadersInit | undefined,
    sent: Record<string, string>,
  ][] = [
    [
      'a plain object',
      { authorization: 'Bearer t' },
      { authorization: 'Bearer t', accept: 'application/json' },
    ],
    [
      'a Headers instance',
      new Headers({ authorization: 'Bearer t' }),
      { authorization: 'Bearer t', accept: 'application/json' },
    ],
    [
      'a tuple array',
      [
        ['authorization', 'Bearer t'],
        ['x-trace', '7'],
      ],
      {
        authorization: 'Bearer t',
        'x-trace': '7',
        accept: 'application/json',
      },
    ],
    ['no headers at all', undefined, { accept: 'application/json' }],
    [
      'a caller-supplied accept',
      { Accept: 'text/csv' },
      { accept: 'text/csv' },
    ],
  ]

  it.each(inputs)(
    'keeps %s and merges it into what h3 forwards',
    async (_name, headers, expected) => {
      await createCheckedEventFetch(fakeEventFetch)(
        '/api/anything',
        headers === undefined ? undefined : { headers }
      )

      expect(sentHeaders()).toEqual({ ...FORWARDED, ...expected })
    }
  )

  it('flattens to a plain object, which is the inverse of the global rule', async () => {
    // The global wrapper hands its `Headers` on whole (ofetch merges it
    // correctly); here the same value would spread to nothing - which is why
    // one shared merge helper would be a defect.
    await createCheckedEventFetch(fakeEventFetch)('/api/anything', {
      headers: new Headers({ authorization: 'Bearer t' }),
    })

    const handed = calls.at(-1)?.init?.headers

    expect(handed).not.toBeInstanceOf(Headers)
    expect(handed).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('lets a caller override a header h3 forwarded', async () => {
    // h3 spreads `init?.headers` after the forwarded set, so a per-call
    // header wins per key - but only because of the flatten.
    await createCheckedEventFetch(fakeEventFetch)('/api/anything', {
      headers: { cookie: 'session=override' },
    })

    expect(sentHeaders()).toMatchObject({
      cookie: 'session=override',
      'user-agent': 'probe',
    })
  })

  it('forwards the request and every other init property verbatim', async () => {
    // `context` is the one h3 reads to decide whether the callee inherits the
    // caller's context object.
    await createCheckedEventFetch(fakeEventFetch)('/api/anything', {
      method: 'POST',
      query: { page: 2 },
      context: { tenant: 'acme' },
    })

    expect(calls.at(-1)?.request).toBe('/api/anything')
    expect(calls.at(-1)?.init).toMatchObject({
      method: 'POST',
      query: { page: 2 },
      context: { tenant: 'acme' },
    })
  })
})

describe('the instance is the seam exactly', () => {
  it('has neither raw nor create at run time', async () => {
    // `event.$fetch` is a bare closure, not an ofetch instance - growing
    // either member would offer calls that cannot be made. The type-level
    // half is in `test/types/fetch.test.ts`.
    const checked = createCheckedEventFetch(fakeEventFetch)

    expect('try' in checked).toBe(true)
    expect('raw' in checked).toBe(false)
    expect('create' in checked).toBe(false)
    expect('native' in checked).toBe(false)
  })
})

describe('.try is the global’s, not a second copy', () => {
  // `toTryResult` is imported rather than rewritten, so
  // `test/unit/try-result.test.ts`'s enumeration covers this surface too;
  // what is asserted here is only that this wrapper really routes through it.
  it('answers the success arm when the call resolves', async () => {
    outcome = { resolve: { id: '7' } }

    expect(
      await createCheckedEventFetch(fakeEventFetch).try('/api/anything')
    ).toEqual({ data: { id: '7' }, error: undefined })
  })

  it('answers the failure arm with the callee’s carrier', async () => {
    outcome = { reject: knownFailure({ tag: 'userNotFound', status: 404 }) }

    const result =
      await createCheckedEventFetch(fakeEventFetch).try('/api/anything')

    expect(result.data).toBeUndefined()
    expect(result.error?.status).toBe(404)
  })

  it('normalises a failure the callee never declared, too', async () => {
    // A production-stripped body still comes back through `error`: the
    // predecessor's rethrow-unless-declared rule is gone.
    outcome = { reject: { data: { statusCode: 500 }, statusCode: 500 } }

    const result = await settled(() =>
      createCheckedEventFetch(fakeEventFetch).try('/api/anything')
    )

    if (result.threw) throw new Error('.try rethrew')

    expect(result.value.error?.status).toBe(500)
  })

  it('applies the same header merge as the throwing form', async () => {
    outcome = { reject: knownFailure({ tag: 't', status: 404 }) }

    await createCheckedEventFetch(fakeEventFetch).try('/api/anything', {
      headers: new Headers({ 'x-trace': '7' }),
    })

    expect(sentHeaders()).toEqual({
      ...FORWARDED,
      'x-trace': '7',
      accept: 'application/json',
    })
  })

  it('leaves the throwing form throwing, known or not', async () => {
    const thrown = knownFailure({ tag: 't', status: 404 })

    outcome = { reject: thrown }

    expect(
      await settled(() =>
        createCheckedEventFetch(fakeEventFetch)('/api/anything')
      )
    ).toEqual({ threw: true, value: thrown })
  })
})

describe('the skew guard: event.$fetch gone at runtime', () => {
  // `event.$fetch` is `@experimental`, so a newer nitro/h3 may stop assigning
  // it; the guard names the skew instead of the bare "not a function".
  it('throws the named error, and nothing reaches the wire', async () => {
    const checked = createCheckedEventFetch(() => undefined)

    const result = await settled(() => checked('/api/anything'))

    expect(result.threw).toBe(true)
    expect(result.value).toBeInstanceOf(EventFetchUnavailableError)
    if (!(result.value instanceof Error)) throw new Error('not an Error')
    expect(result.value.name).toBe('EventFetchUnavailableError')
    expect(result.value.message).toMatch(/version skew/)
    expect(calls).toHaveLength(0)
  })

  it('throws through .try rather than answering the failure arm', async () => {
    // Skew is not a fetch failure - it must not be buried in a carrier a
    // caller would read as an upstream 500.
    const checked = createCheckedEventFetch(() => undefined)

    const result = await settled(() => checked.try('/api/anything'))

    expect(result.threw).toBe(true)
    expect(result.value).toBeInstanceOf(EventFetchUnavailableError)
  })

  it('checks once: a verified wrapper does not re-police later replacements', async () => {
    let base: ReturnType<typeof fakeEventFetch> | undefined = fakeEventFetch()
    const checked = createCheckedEventFetch(() => base)

    await checked('/api/anything')

    base = undefined

    const result = await settled(() => checked('/api/anything'))

    expect(result.threw).toBe(true)
    expect(result.value).not.toBeInstanceOf(EventFetchUnavailableError)
  })
})

describe('the channel tag - the EVENT-BOUND form', () => {
  // Handed in as a constructor argument rather than read from shared module
  // state: this surface is built per request, so plugin order is not
  // load-bearing.
  it('attaches nothing when no token is configured', async () => {
    await createCheckedEventFetch(fakeEventFetch)('/api/anything')

    expect(sentHeaders()).toEqual({
      ...FORWARDED,
      accept: 'application/json',
    })
  })

  it('attaches the token, flattened like everything else on this surface', async () => {
    // The tag must survive h3's spread or gating silently fails open for SSR.
    await createCheckedEventFetch(fakeEventFetch, 'first-party')(
      '/api/anything',
      { headers: { authorization: 'Bearer t' } }
    )

    expect(sentHeaders()).toEqual({
      ...FORWARDED,
      authorization: 'Bearer t',
      accept: 'application/json',
      [CHANNEL_HEADER]: 'first-party',
    })
  })

  it('overrides a caller’s own value for the header', async () => {
    await createCheckedEventFetch(fakeEventFetch, 'first-party')(
      '/api/anything',
      { headers: { [CHANNEL_HEADER]: 'forged' } }
    )

    expect(sentHeaders()).toMatchObject({ [CHANNEL_HEADER]: 'first-party' })
  })

  it('rides .try as well', async () => {
    await createCheckedEventFetch(fakeEventFetch, 'first-party').try(
      '/api/anything'
    )

    expect(sentHeaders()).toMatchObject({ [CHANNEL_HEADER]: 'first-party' })
  })
})
