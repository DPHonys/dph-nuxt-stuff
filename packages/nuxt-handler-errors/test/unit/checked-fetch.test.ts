import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import { createCheckedFetch } from '../../src/runtime/shared/checked-fetch'
import { setConfiguredChannelToken } from '../doubles/channel-token'
import { knownFailure, settled } from '../fetch-channel'

// The run-time half of `$checkedFetch`. No `#app` double needed: the value is
// side-agnostic, and the fetcher underneath is a parameter — that parameter is
// the whole seam.

/** Whatever ofetch would accept; only `headers` is read here. */
interface FetchOptionsLike {
  headers?: HeadersInit
}

/** One call as it reached the fetcher underneath. */
interface Recorded {
  readonly member: 'call' | 'raw' | 'native'
  readonly request: unknown
  /** Exactly what the wrapper handed on, unresolved. */
  readonly opts: FetchOptionsLike | undefined
  /** What ofetch would put on the wire, once its own defaults are merged in. */
  readonly sent: Headers
}

const calls: Recorded[] = []

/** What the fake fetcher does next: resolve with this, or reject with it. */
let outcome: { resolve: unknown } | { reject: unknown } = { resolve: 'ok' }

/**
 * ofetch's own header merge, verbatim (`ofetch@1.5.1`): instance defaults
 * first, then every call header set over them.
 */
function mergeLikeOfetch(
  input: HeadersInit | undefined,
  defaults: HeadersInit | undefined
): Headers {
  const headers = new Headers(defaults)

  if (input !== undefined) {
    for (const [name, value] of new Headers(input)) headers.set(name, value)
  }

  return headers
}

/**
 * A stand-in for vanilla's namespace, recording what it was handed and what
 * ofetch would have sent. `create` must really merge defaults — the wrapper's
 * `create` closure exists to answer "do the instance defaults already carry an
 * `accept`?", and a fake that discarded them could not tell a right answer
 * from a wrong one. So `create` here is ofetch's own shallow spread, where a
 * `headers` key replaces the instance's wholesale.
 */
function fakeFetch(defaults: FetchOptionsLike = {}) {
  const settle = (): Promise<unknown> =>
    'reject' in outcome
      ? Promise.reject(outcome.reject)
      : Promise.resolve(outcome.resolve)

  const send = (
    member: Recorded['member'],
    request: unknown,
    opts: FetchOptionsLike | undefined
  ): Promise<unknown> => {
    calls.push({
      member,
      request,
      opts,
      sent: mergeLikeOfetch(opts?.headers, defaults.headers),
    })

    return settle()
  }

  return Object.assign(
    (request: unknown, opts?: FetchOptionsLike) => send('call', request, opts),
    {
      raw: (request: unknown, opts?: FetchOptionsLike) =>
        send('raw', request, opts),
      create: (next: FetchOptionsLike) => fakeFetch({ ...defaults, ...next }),
      native: ((request: unknown, init?: FetchOptionsLike) =>
        send('native', request, init)) as unknown as typeof globalThis.fetch,
    }
  )
}

/** The headers that would go on the wire for the last call. */
function sentHeaders(): Record<string, string> {
  const last = calls.at(-1)

  if (last === undefined) throw new Error('nothing reached the fetcher')

  return Object.fromEntries(last.sent)
}

beforeEach(() => {
  calls.length = 0
  outcome = { resolve: 'ok' }
})

describe('the header merge — the GLOBAL form', () => {
  it('keeps a plain object and adds accept', async () => {
    await createCheckedFetch(fakeFetch())('/anything', {
      headers: { authorization: 'Bearer t' },
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('keeps a Headers instance, which a spread would drop whole', async () => {
    // `new Headers({ authorization })` has no own enumerable properties, so
    // `{ accept, ...opts.headers }` silently drops every header the caller set.
    await createCheckedFetch(fakeFetch())('/anything', {
      headers: new Headers({ authorization: 'Bearer t' }),
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('keeps a tuple array, which a spread would corrupt outright', async () => {
    await createCheckedFetch(fakeFetch())('/anything', {
      headers: [
        ['authorization', 'Bearer t'],
        ['x-trace', '7'],
      ],
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      'x-trace': '7',
      accept: 'application/json',
    })
  })

  it('honours a caller’s own accept, in every input shape', async () => {
    const checked = createCheckedFetch(fakeFetch())

    await checked('/anything', { headers: { accept: 'text/html' } })
    expect(sentHeaders().accept).toBe('text/html')

    await checked('/anything', { headers: new Headers({ Accept: 'text/csv' }) })
    expect(sentHeaders().accept).toBe('text/csv')

    await checked('/anything', { headers: [['ACCEPT', 'text/plain']] })
    expect(sentHeaders().accept).toBe('text/plain')
  })

  it('adds accept when the caller passed no headers at all', async () => {
    await createCheckedFetch(fakeFetch())('/anything')

    expect(sentHeaders()).toEqual({ accept: 'application/json' })
  })

  it('hands the fetcher a Headers instance, unflattened', async () => {
    // The categorical difference from the other two merges: ofetch's
    // `mergeHeaders` takes a `Headers` correctly, while the event-bound and
    // composable surfaces reach h3's spread and must flatten. The correct fix
    // for one is wrong for the others.
    await createCheckedFetch(fakeFetch())('/anything', {
      headers: { authorization: 'Bearer t' },
    })

    expect(calls.at(-1)?.opts?.headers).toBeInstanceOf(Headers)
  })

  it('forwards every other option verbatim', async () => {
    // True by construction: `opts` is spread.
    await createCheckedFetch(fakeFetch())('/anything', {
      method: 'POST',
      query: { page: 2 },
      retry: 3,
    } as never)

    expect(calls.at(-1)?.opts).toMatchObject({
      method: 'POST',
      query: { page: 2 },
      retry: 3,
    })
  })

  it('merges the same way on raw, which is still a request', async () => {
    await createCheckedFetch(fakeFetch()).raw('/anything', {
      headers: { 'x-trace': '7' },
    })

    expect(calls.at(-1)?.member).toBe('raw')
    expect(sentHeaders()).toEqual({
      'x-trace': '7',
      accept: 'application/json',
    })
  })

  it('leaves native alone — a bare fetch is not a Nitro request', async () => {
    await createCheckedFetch(fakeFetch()).native('/anything')

    expect(calls.at(-1)?.member).toBe('native')
    expect(calls.at(-1)?.opts).toBeUndefined()
  })
})

describe('create, and the instance half of the rule', () => {
  it('leaves an instance-level accept alone', async () => {
    // The rule: set `accept` only when neither the call nor the instance
    // defaults carry it.
    const instance = createCheckedFetch(fakeFetch()).create({
      headers: { accept: 'application/vnd.api+json' },
    })

    await instance('/anything')

    expect(sentHeaders().accept).toBe('application/vnd.api+json')
  })

  it('still lets a call-level accept through untouched', async () => {
    const instance = createCheckedFetch(fakeFetch()).create({
      headers: { accept: 'application/vnd.api+json' },
    })

    await instance('/anything', { headers: { accept: 'text/csv' } })

    expect(sentHeaders().accept).toBe('text/csv')
  })

  it('adds accept for an instance whose defaults carry other headers', async () => {
    const instance = createCheckedFetch(fakeFetch()).create({
      headers: { authorization: 'Bearer t' },
    })

    await instance('/anything')

    expect(sentHeaders().accept).toBe('application/json')
  })

  it('tracks a nested create the way ofetch really does', async () => {
    // ofetch merges `create` defaults by *shallow* spread, so a `headers` key
    // in the inner create replaces the outer's wholesale. A closure that
    // accumulated headers across creates would believe the `accept` was still
    // there and send the request with none at all.
    const instance = createCheckedFetch(fakeFetch())
      .create({ headers: { accept: 'application/vnd.api+json' } })
      .create({ headers: { authorization: 'Bearer t' } })

    await instance('/anything')

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('leaves an instance accept alone when a create names no headers', async () => {
    // The other half of the same shallow spread: with no `headers` key, the
    // outer's survive inside ofetch, so this module must not overwrite them.
    const instance = createCheckedFetch(fakeFetch())
      .create({ headers: { accept: 'application/vnd.api+json' } })
      .create({ retry: 3 } as never)

    await instance('/anything')

    expect(sentHeaders().accept).toBe('application/vnd.api+json')
  })

  it('keeps the sibling on a created instance', async () => {
    outcome = { resolve: { id: '7' } }

    const result = await createCheckedFetch(fakeFetch())
      .create({ baseURL: '/api' })
      .try('/anything')

    expect(result).toEqual({ data: { id: '7' }, error: undefined })
  })
})

describe('.try over this surface', () => {
  it('answers the success arm when the call resolves', async () => {
    outcome = { resolve: { id: '7' } }

    expect(await createCheckedFetch(fakeFetch()).try('/anything')).toEqual({
      data: { id: '7' },
      error: undefined,
    })
  })

  it('answers the failure arm with the carrier', async () => {
    outcome = { reject: knownFailure({ tag: 'user-not-found', status: 404 }) }

    const result = await createCheckedFetch(fakeFetch()).try('/anything')

    expect(result.data).toBeUndefined()
    expect(result.error?.status).toBe(404)
  })

  it('applies the same header merge as the throwing form', async () => {
    outcome = { reject: knownFailure({ tag: 't', status: 404 }) }

    await createCheckedFetch(fakeFetch()).try('/anything', {
      headers: new Headers({ 'x-trace': '7' }),
    })

    expect(sentHeaders()).toEqual({
      'x-trace': '7',
      accept: 'application/json',
    })
  })

  it('leaves the throwing form throwing, known or not', async () => {
    // A pure typings mirror of vanilla `$fetch`, which is what keeps
    // `useAsyncData(() => $checkedFetch(…))` working.
    const thrown = knownFailure({ tag: 't', status: 404 })

    outcome = { reject: thrown }

    expect(
      await settled(() => createCheckedFetch(fakeFetch())('/anything'))
    ).toEqual({ threw: true, value: thrown })
  })

  it('leaves raw throwing too — it has no .try of its own', async () => {
    const thrown = knownFailure({ tag: 't', status: 404 })

    outcome = { reject: thrown }

    expect(
      await settled(() => createCheckedFetch(fakeFetch()).raw('/anything'))
    ).toEqual({ threw: true, value: thrown })
  })
})

describe('the channel tag — the GLOBAL form', () => {
  // The token is module state via the double, so every test here clears it.
  afterEach(() => {
    setConfiguredChannelToken(undefined)
  })

  it('attaches nothing when no token is configured — today’s behaviour', async () => {
    await createCheckedFetch(fakeFetch())('/anything')

    expect(sentHeaders()).toEqual({ accept: 'application/json' })
  })

  it('attaches the token beside accept once one is configured', async () => {
    setConfiguredChannelToken('first-party')

    await createCheckedFetch(fakeFetch())('/anything', {
      headers: { authorization: 'Bearer t' },
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
      [CHANNEL_HEADER]: 'first-party',
    })
  })

  it('overrides a caller’s own value for the header — it is the module’s', async () => {
    // Unlike `accept`, this header is not a caller's to choose: a caller
    // value would only gate that call out of the wire it asked for.
    setConfiguredChannelToken('first-party')

    await createCheckedFetch(fakeFetch())('/anything', {
      headers: { [CHANNEL_HEADER]: 'forged' },
    })

    expect(sentHeaders()[CHANNEL_HEADER]).toBe('first-party')
  })

  it('rides raw and .try too, which are requests like any other', async () => {
    setConfiguredChannelToken('first-party')

    const $fetch = createCheckedFetch(fakeFetch())

    await $fetch.raw('/anything')
    expect(sentHeaders()[CHANNEL_HEADER]).toBe('first-party')

    await $fetch.try('/anything')
    expect(sentHeaders()[CHANNEL_HEADER]).toBe('first-party')
  })

  it('is read at call time, so a created instance picks it up as well', async () => {
    const instance = createCheckedFetch(fakeFetch()).create({
      headers: { authorization: 'Bearer t' },
    })

    setConfiguredChannelToken('first-party')

    await instance('/anything')

    expect(sentHeaders()[CHANNEL_HEADER]).toBe('first-party')
  })
})
