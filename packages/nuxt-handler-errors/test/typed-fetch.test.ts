import { beforeEach, describe, expect, it } from 'vitest'
import { DECLARED_ERROR_KEY } from '../src/runtime/shared'
import { createTypedFetch } from '../src/runtime/typed-fetch'
import { declaredFailure, settled } from './failure-channel'

/**
 * The run-time half of `$typedFetch` (SPEC.md §3.5, §3.8).
 *
 * Unlike the composable, this file needs no `#app` double: `$typedFetch` is
 * side-agnostic by construction, so the wrapper loads under a plain
 * `vitest run` and the thing underneath it is a parameter. That parameter is
 * the whole seam — what reaches it is exactly what would have reached ofetch.
 *
 * **`.safe` decides whether a caller sees a failure at all**, which is why the
 * rethrow half below is enumerated rather than sampled: every shape that is not
 * a well-formed declared marker has to leave through `throw`, carrying the
 * original value untouched.
 */

/** Whatever ofetch would accept; only `headers` is read here. */
interface FetchOptionsLike {
  headers?: HeadersInit
}

/** One call as it reached the fetcher underneath. */
interface Recorded {
  readonly member: 'call' | 'raw'
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
 * ofetch's own header merge, verbatim
 * (`ofetch@1.5.1 dist/shared/ofetch.CWycOUEr.mjs:121-131`): the instance's
 * defaults first, then every call header set over them — so a call header wins
 * per key.
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
 * A stand-in for vanilla's namespace, recording what it was handed **and what
 * ofetch would have sent**.
 *
 * The second half is the point. This wrapper's `create` closure exists only to
 * answer *"do the instance defaults already carry an `accept`?"*, and a fake
 * whose `create` threw its argument away could not tell a right answer from a
 * wrong one — measured: with the defaults discarded, an instance that has lost
 * its `accept` inside ofetch and one that still has it are indistinguishable,
 * and the failure reads as a pass. So `create` here is ofetch's own shallow
 * spread (`:337`), where a `headers` key replaces the instance's wholesale and
 * a `create` naming no headers leaves them alone.
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

describe('the header merge — the global form (SPEC.md §3.8)', () => {
  it('keeps a plain object and adds accept', async () => {
    await createTypedFetch(fakeFetch())('/anything', {
      headers: { authorization: 'Bearer t' },
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('keeps a Headers instance, which a spread would drop whole', async () => {
    // SPEC.md §3.8's shipped-defect-class bug: `new Headers({ authorization })`
    // has no own enumerable properties, so `{ accept, ...opts.headers }`
    // silently drops every header the caller set.
    await createTypedFetch(fakeFetch())('/anything', {
      headers: new Headers({ authorization: 'Bearer t' }),
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('keeps a tuple array, which a spread would corrupt outright', async () => {
    await createTypedFetch(fakeFetch())('/anything', {
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
    // SPEC.md §3.8's first further rule. Overriding it forfeits the declared
    // error channel for routes outside `/api/**`, which is a documentation note
    // rather than something to prevent — the caller asked.
    const typed = createTypedFetch(fakeFetch())

    await typed('/anything', { headers: { accept: 'text/html' } })
    expect(sentHeaders().accept).toBe('text/html')

    await typed('/anything', { headers: new Headers({ Accept: 'text/csv' }) })
    expect(sentHeaders().accept).toBe('text/csv')

    await typed('/anything', { headers: [['ACCEPT', 'text/plain']] })
    expect(sentHeaders().accept).toBe('text/plain')
  })

  it('adds accept when the caller passed no headers at all', async () => {
    await createTypedFetch(fakeFetch())('/anything')

    expect(sentHeaders()).toEqual({ accept: 'application/json' })
  })

  it('hands the fetcher a Headers instance, unflattened', async () => {
    // **The categorical difference from the composable's merge, and the reason
    // SPEC.md §3.8 says one shared helper would be a defect.** What sits under
    // this surface is an ofetch instance, whose `mergeHeaders` takes a
    // `Headers` correctly. `event.$typedFetch` reaches h3's `fetchWithEvent`
    // instead, which merges by object spread and would discard a `Headers`
    // whole, and `useTypedFetch` reaches it too on the SSR path
    // (SPEC-AMENDMENTS item 30) — so both of those flatten and this one must
    // not. The correct fix for one is wrong for the others.
    await createTypedFetch(fakeFetch())('/anything', {
      headers: { authorization: 'Bearer t' },
    })

    expect(calls.at(-1)?.opts?.headers).toBeInstanceOf(Headers)
  })

  it('forwards every other option verbatim', async () => {
    // True by construction rather than by enumeration: `opts` is spread, so
    // anything a future ofetch adds passes through with no change here.
    await createTypedFetch(fakeFetch())('/anything', {
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
    await createTypedFetch(fakeFetch()).raw('/anything', {
      headers: { 'x-trace': '7' },
    })

    expect(calls.at(-1)?.member).toBe('raw')
    expect(sentHeaders()).toEqual({
      'x-trace': '7',
      accept: 'application/json',
    })
  })
})

describe('create, and the instance half of the rule (SPEC.md §3.8)', () => {
  it('leaves an instance-level accept alone', async () => {
    // SPEC.md §3.8's global rule is *set `accept` only when neither the call
    // nor the instance defaults carry it*, and names `create`'s closure as what
    // checks the second half. Without that check this module would silently
    // override a content type the consumer configured for the whole instance.
    const instance = createTypedFetch(fakeFetch()).create({
      headers: { accept: 'application/vnd.api+json' },
    })

    await instance('/anything')

    expect(sentHeaders().accept).toBe('application/vnd.api+json')
  })

  it('still lets a call-level accept through untouched', async () => {
    const instance = createTypedFetch(fakeFetch()).create({
      headers: { accept: 'application/vnd.api+json' },
    })

    await instance('/anything', { headers: { accept: 'text/csv' } })

    // ofetch's own `mergeHeaders(input, defaults)` is what makes the call win;
    // this asserts the wrapper did not get in the way of it.
    expect(sentHeaders().accept).toBe('text/csv')
  })

  it('adds accept for an instance whose defaults carry other headers', async () => {
    const instance = createTypedFetch(fakeFetch()).create({
      headers: { authorization: 'Bearer t' },
    })

    await instance('/anything')

    expect(sentHeaders().accept).toBe('application/json')
  })

  it('tracks a nested create the way ofetch really does', async () => {
    // **The obvious spelling of this is a bug, and it was the one written
    // first.** `create`'s defaults are merged by a *shallow* spread
    // (`ofetch@1.5.1 dist/shared/ofetch.CWycOUEr.mjs:337`), so a `headers` key
    // in the inner create replaces the outer's wholesale — ofetch has already
    // dropped that `accept` by the time the request goes out. A closure that
    // accumulated headers across creates would still believe it was there,
    // suppress this module's own, and send the request with **no `accept` at
    // all** — which SPEC.md §3.8 says turns a declared 403 into an HTML string
    // in `err.data`, i.e. exactly the outcome the rule exists to prevent.
    const instance = createTypedFetch(fakeFetch())
      .create({ headers: { accept: 'application/vnd.api+json' } })
      .create({ headers: { authorization: 'Bearer t' } })

    await instance('/anything')

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('leaves an instance accept alone when a create names no headers', async () => {
    // The other half of the same shallow spread, and the control for the row
    // above: with no `headers` key in the inner create, the outer's survive
    // inside ofetch — so this module must not overwrite what is still there.
    const instance = createTypedFetch(fakeFetch())
      .create({ headers: { accept: 'application/vnd.api+json' } })
      .create({ retry: 3 } as never)

    await instance('/anything')

    expect(sentHeaders().accept).toBe('application/vnd.api+json')
  })

  it('keeps the sibling on a created instance', async () => {
    // SPEC.md §3.5: `create` returns the *typed* interface. The type-level half
    // is in `test/types/pos/typed-fetch.ts`; this is the value being really
    // there.
    outcome = { resolve: { id: '7' } }

    const result = await createTypedFetch(fakeFetch())
      .create({ baseURL: '/api' })
      .safe('/anything')

    expect(result).toEqual({ ok: true, data: { id: '7' } })
  })
})

describe('.safe returns only what the route declared (SPEC.md §3.5)', () => {
  it('answers the success arm when the call resolves', async () => {
    outcome = { resolve: { id: '7' } }

    expect(await createTypedFetch(fakeFetch()).safe('/anything')).toEqual({
      ok: true,
      data: { id: '7' },
    })
  })

  it('answers the false arm with the flat variant, not the envelope', async () => {
    // `error` is the variant itself: the wrapper has already run the reader.
    // The envelope carries nothing a caller needs — the status is on the
    // variant, and both `message` and `statusMessage` are the tag.
    const variant = { tag: 'user-not-found', status: 404, userId: '42' }

    outcome = { reject: declaredFailure(variant) }

    expect(await createTypedFetch(fakeFetch()).safe('/anything')).toEqual({
      ok: false,
      error: variant,
    })
  })

  it('applies the same header merge as the throwing form', async () => {
    outcome = { reject: declaredFailure({ tag: 't', status: 404 }) }

    await createTypedFetch(fakeFetch()).safe('/anything', {
      headers: new Headers({ 'x-trace': '7' }),
    })

    expect(sentHeaders()).toEqual({
      'x-trace': '7',
      accept: 'application/json',
    })
  })
})

describe('.safe swallows nothing (SPEC.md §3.5, §6.5)', () => {
  /**
   * Every shape that is **not** a well-formed declared marker, and the same
   * claim about each: it leaves through `throw`, and the value a caller catches
   * is the one vanilla `$fetch` would have given them — the same instance, so
   * `status`, `data` and the stack are all still there.
   *
   * The list is exhaustive rather than illustrative because `ok: false` is the
   * only thing standing between a caller and a failure they never see. The
   * three rows that read as near-misses are the ones that matter: a marker
   * whose shape floor is unmet (SPEC.md §5.3), a marker one hop too shallow,
   * and a production-stripped body whose `data` Nitro wiped (SPEC.md §6.5).
   */
  const rethrown: readonly [name: string, thrown: unknown][] = [
    ['a plain Error', new Error('boom')],
    ['a framework error with no marker', { status: 500, data: undefined }],
    ['an error body whose data is stripped', { data: { statusCode: 500 } }],
    ['an error body with an unrelated data', { data: { data: { x: 1 } } }],
    [
      'a marker one hop too shallow',
      { data: { [DECLARED_ERROR_KEY]: { tag: 't', status: 404 } } },
    ],
    [
      'a marker whose tag is not a string',
      declaredFailure({ tag: 7, status: 404 }),
    ],
    [
      'a marker whose status is not a number',
      declaredFailure({ tag: 't', status: '404' }),
    ],
    ['a marker with no status at all', declaredFailure({ tag: 't' })],
    ['a marker that is null', declaredFailure(null)],
    ['a marker that is an array', declaredFailure(['tag', 'status'])],
    [
      'a marker that is a function carrying the fields',
      declaredFailure(Object.assign(() => {}, { tag: 't', status: 404 })),
    ],
    ['a thrown string', 'not an object'],
    ['a thrown number', 7],
    ['a thrown null', null],
    ['a thrown undefined', undefined],
  ]

  it.each(rethrown)('rethrows %s, untouched', async (_name, thrown) => {
    outcome = { reject: thrown }

    const result = await settled(() =>
      createTypedFetch(fakeFetch()).safe('/anything')
    )

    expect(result.threw).toBe(true)
    expect(result.value).toBe(thrown)
  })

  it('has a control: the same body with a well-formed marker does not throw', async () => {
    // Without this every row above would pass just as well against a `.safe`
    // that threw unconditionally.
    outcome = { reject: declaredFailure({ tag: 't', status: 404 }) }

    const result = await settled(() =>
      createTypedFetch(fakeFetch()).safe('/anything')
    )

    expect(result).toEqual({
      threw: false,
      value: { ok: false, error: { tag: 't', status: 404 } },
    })
  })

  it('leaves the throwing form throwing, declared or not', async () => {
    // The default entry point is a pure typings mirror: a declared failure
    // throws through it exactly as it throws through vanilla `$fetch`, which is
    // what keeps `useAsyncData(() => $typedFetch(…))` working (SPEC.md §3.4).
    const thrown = declaredFailure({ tag: 't', status: 404 })

    outcome = { reject: thrown }

    const result = await settled(() =>
      createTypedFetch(fakeFetch())('/anything')
    )

    expect(result).toEqual({ threw: true, value: thrown })
  })

  it('leaves raw throwing too, declared or not', async () => {
    // `raw`'s value is the response object, which is orthogonal to the declared
    // channel — ofetch throws on `!response.ok` there as well — so it gets no
    // sibling of its own.
    const thrown = declaredFailure({ tag: 't', status: 404 })

    outcome = { reject: thrown }

    const result = await settled(() =>
      createTypedFetch(fakeFetch()).raw('/anything')
    )

    expect(result).toEqual({ threw: true, value: thrown })
  })
})
