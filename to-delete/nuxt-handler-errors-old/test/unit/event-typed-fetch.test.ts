import { beforeEach, describe, expect, it } from 'vitest'
import {
  createEventTypedFetch,
  EventFetchUnavailableError,
} from '../../src/runtime/server/lib/event-typed-fetch'
import { declaredFailure, settled } from '../failure-channel'

/**
 * The run-time half of `event.$typedFetch`.
 *
 * **The fake here is not `test/unit/typed-fetch.test.ts`'s fake, and that is the
 * whole point of the file.** The global wrapper sits on an ofetch instance,
 * whose `mergeHeaders` takes a `Headers` correctly; this one sits on h3's
 * `fetchWithEvent`, which builds its options by **object spread**. So the
 * double below is `fetchWithEvent`'s own body rather than ofetch's, and every
 * assertion is on what would go **on the wire** after that spread — not on what
 * the wrapper handed over. Measured: asserting on the handed-over value instead
 * makes the headline header bug read as a pass, because a `Headers` and a
 * flattened object are equally present until something spreads them.
 */

/** Whatever `event.$fetch` would accept; only `headers` is read here. */
interface EventFetchInit {
  headers?: HeadersInit
}

/**
 * The headers h3 forwards off the incoming request
 * (`getProxyRequestHeaders`), standing in for a real one.
 *
 * `accept` is deliberately **not** among them: h3 lists it in `ignoredHeaders`
 * (`h3@1.15.11 dist/index.mjs:1138-1147`), which is precisely why this surface
 * needs a presence check and not the global's three-way one — there is no
 * incoming `accept` for the wrapper to defer to, ever.
 */
const FORWARDED: Readonly<Record<string, string>> = {
  cookie: 'session=abc',
  'user-agent': 'probe',
}

/** One call as it reached the event's fetch. */
interface Recorded {
  readonly request: unknown
  /** Exactly what the wrapper handed on, unresolved. */
  readonly init: EventFetchInit | undefined
  /** What h3's spread would put on the wire. */
  readonly sent: Record<string, unknown>
}

const calls: Recorded[] = []

/** What the fake does next: resolve with this, or reject with it. */
let outcome: { resolve: unknown } | { reject: unknown } = { resolve: 'ok' }

/**
 * `event.$fetch`, as h3 really builds it.
 *
 * ```js
 * function fetchWithEvent(event, req, init, options) {
 *   return _getFetch(options?.fetch)(req, {
 *     ...init,
 *     context: init?.context || event.context,
 *     headers: { ...getProxyRequestHeaders(event, …), ...init?.headers },
 *   })
 * }
 * ```
 *
 * — `h3@1.15.11 dist/index.mjs:1263-1274`, and the `headers` line is copied
 * verbatim. That single spread is the reason the correct global merge is
 * *actively wrong* here, and modelling anything gentler would hide it.
 */
function fakeEventFetch(): (
  request: unknown,
  init?: EventFetchInit
) => Promise<unknown> {
  return (request, init) => {
    calls.push({
      request,
      init,
      sent: { ...FORWARDED, ...init?.headers },
    })

    return 'reject' in outcome
      ? Promise.reject(outcome.reject)
      : Promise.resolve(outcome.resolve)
  }
}

/** The headers that would go on the wire for the last call. */
function sentHeaders(): Record<string, unknown> {
  const last = calls.at(-1)

  if (last === undefined) throw new Error('nothing reached the event fetch')

  return last.sent
}

beforeEach(() => {
  calls.length = 0
  outcome = { resolve: 'ok' }
})

describe('the header merge — the EVENT-BOUND form', () => {
  /**
   * One row per legal input form plus the two edge cases
   * the ticket names. Every row asserts the **whole** header set that would go
   * on the wire, so a caller's header going missing and a forwarded header
   * going missing are both failures.
   *
   * Three mutations were run against the whole file, and each reddens a
   * different subset — which is what says the rows measure three separate
   * things rather than one:
   *
   * | mutation | failures / 14 | rows spared |
   * | --- | --- | --- |
   * | hand the merged `Headers` on unflattened (the *global's* correct fix) | **8** | none of the merge rows |
   * | a naive `{ accept, ...init?.headers }` spread | **5** | the plain-object row and the no-headers row |
   * | drop the `accept` set | **6** | the caller-supplied-`accept` row |
   *
   * Row 1 is the ticket's headline: the fix that is *correct* one file over
   * discards the caller's headers **and** this module's own `accept` here. Row
   * 2 is the named shipped-defect-class bug, which survives a plain
   * object and dies on the two other legal forms. Row 3 is the header simply
   * not being added.
   */
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
      // The form that breaks silently. `new Headers({…})` has no own
      // enumerable properties, so h3's spread sees an empty object — the
      // caller's headers *and* this module's `accept` vanish together.
      'a Headers instance',
      new Headers({ authorization: 'Bearer t' }),
      { authorization: 'Bearer t', accept: 'application/json' },
    ],
    [
      // Worse than dropped: a tuple array spreads to `{"0": […], "1": […]}`,
      // which is a corrupted header set rather than an absent one.
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
      // A caller's own `accept` is honoured
      // on both surfaces. Overriding it forfeits the declared-error channel for
      // a callee outside `/api/**`, which is a documentation note rather than
      // something to prevent — the caller asked.
      'a caller-supplied accept',
      { Accept: 'text/csv' },
      { accept: 'text/csv' },
    ],
  ]

  it.each(inputs)(
    'keeps %s and merges it into what h3 forwards',
    async (_name, headers, expected) => {
      await createEventTypedFetch(fakeEventFetch)(
        '/api/anything',
        headers === undefined ? undefined : { headers }
      )

      expect(sentHeaders()).toEqual({ ...FORWARDED, ...expected })
    }
  )

  it('flattens to a plain object, which is the inverse of the global rule', async () => {
    // **The categorical difference, asserted on the object itself.** The global
    // wrapper hands its `Headers` on whole and `test/unit/typed-fetch.test.ts`
    // asserts exactly that; here the same value would spread to nothing, so the
    // wrapper must hand over something a spread can see. The claim that *one
    // shared helper would be a defect* is this pair of assertions.
    await createEventTypedFetch(fakeEventFetch)('/api/anything', {
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
    // h3 spreads `init?.headers` **after** the forwarded set, so a per-call
    // header wins per key. Asserted because the flatten is what makes it true:
    // an unflattened `Headers` loses this too, silently.
    await createEventTypedFetch(fakeEventFetch)('/api/anything', {
      headers: { cookie: 'session=override' },
    })

    expect(sentHeaders()).toMatchObject({
      cookie: 'session=override',
      'user-agent': 'probe',
    })
  })

  it('forwards the request and every other init property verbatim', async () => {
    // True by construction rather than by enumeration: the request is passed
    // straight through and `init` is spread, so anything h3 or a caller adds
    // passes through untouched. `context` is named because it is the one h3
    // reads to decide whether the callee inherits the caller's context object.
    await createEventTypedFetch(fakeEventFetch)('/api/anything', {
      method: 'POST',
      query: { page: 2 },
      context: { tenant: 'acme' },
    } as never)

    expect(calls.at(-1)?.request).toBe('/api/anything')
    expect(calls.at(-1)?.init).toMatchObject({
      method: 'POST',
      query: { page: 2 },
      context: { tenant: 'acme' },
    })
  })
})

describe('the namespace is the bare call signature plus .safe', () => {
  it('has neither raw nor create at run time', async () => {
    // `event.$fetch` is `Base$Fetch` — a bare call signature — because it is a
    // closure over `fetchWithEvent` rather than an ofetch instance. Growing
    // either member would be the degradation lock inverted: a
    // completion list *longer* than vanilla's, offering calls that cannot be
    // made. The type-level half is in `test/types/pos/event-typed-fetch.ts`;
    // this is the value really having nothing there.
    const typed = createEventTypedFetch(fakeEventFetch)

    expect('safe' in typed).toBe(true)
    expect('raw' in typed).toBe(false)
    expect('create' in typed).toBe(false)
  })
})

describe('.safe is the global’s, not a second copy', () => {
  /**
   * `toTypedResult` is imported rather than rewritten, so
   * `test/unit/typed-fetch.test.ts`'s 15-row rethrow suite — every shape that is not
   * a well-formed declared marker, each asserted to leave through `throw`
   * carrying the original value — is a claim about **this** surface too. What
   * is asserted here is only that this wrapper really routes through it: the
   * two arms and one near-miss, with the control beside them.
   */
  it('answers the success arm when the call resolves', async () => {
    outcome = { resolve: { id: '7' } }

    expect(
      await createEventTypedFetch(fakeEventFetch).safe('/api/anything')
    ).toEqual({ ok: true, data: { id: '7' } })
  })

  it('answers the false arm with the callee’s flat variant', async () => {
    const variant = { tag: 'user-not-found', status: 404, userId: '42' }

    outcome = { reject: declaredFailure(variant) }

    expect(
      await createEventTypedFetch(fakeEventFetch).safe('/api/anything')
    ).toEqual({ ok: false, error: variant })
  })

  it('rethrows a near-miss untouched, and has a control', async () => {
    // A production-stripped body, which is what an escaped
    // callee failure degrades to. It is *not* a declared failure, so it leaves
    // through `throw` carrying the same instance.
    const stripped = { data: { statusCode: 500 } }

    outcome = { reject: stripped }

    const missed = await settled(() =>
      createEventTypedFetch(fakeEventFetch).safe('/api/anything')
    )

    expect(missed).toEqual({ threw: true, value: stripped })

    // Without this the row above would pass just as well against a `.safe`
    // that threw unconditionally.
    outcome = { reject: declaredFailure({ tag: 't', status: 404 }) }

    expect(
      await settled(() =>
        createEventTypedFetch(fakeEventFetch).safe('/api/anything')
      )
    ).toEqual({
      threw: false,
      value: { ok: false, error: { tag: 't', status: 404 } },
    })
  })

  it('applies the same header merge as the throwing form', async () => {
    outcome = { reject: declaredFailure({ tag: 't', status: 404 }) }

    await createEventTypedFetch(fakeEventFetch).safe('/api/anything', {
      headers: new Headers({ 'x-trace': '7' }),
    })

    expect(sentHeaders()).toEqual({
      ...FORWARDED,
      'x-trace': '7',
      accept: 'application/json',
    })
  })

  it('leaves the throwing form throwing, declared or not', async () => {
    // The default entry point is a pure typings mirror of `event.$fetch`: a
    // declared failure throws through it exactly as it throws through vanilla.
    const thrown = declaredFailure({ tag: 't', status: 404 })

    outcome = { reject: thrown }

    expect(
      await settled(() =>
        createEventTypedFetch(fakeEventFetch)('/api/anything')
      )
    ).toEqual({ threw: true, value: thrown })
  })
})

describe('the skew guard: event.$fetch gone at runtime', () => {
  /**
   * The consumer-side version-skew case: `event.$fetch` is `@experimental`, so
   * a nitro/h3 newer than this module was built against may stop assigning it.
   * The guard turns the bare `event.$fetch is not a function` a caller would
   * otherwise hit into a named error that says what happened.
   */
  it('throws the named error, and nothing reaches the wire', async () => {
    const typed = createEventTypedFetch(() => undefined)

    const result = await settled(() => typed('/api/anything'))

    expect(result.threw).toBe(true)
    expect(result.value).toBeInstanceOf(EventFetchUnavailableError)
    expect((result.value as Error).name).toBe('EventFetchUnavailableError')
    expect((result.value as Error).message).toMatch(/version skew/)
    expect(calls).toHaveLength(0)
  })

  it('rejects through .safe rather than answering an arm', async () => {
    // Skew is not a declared failure: it must leave through `throw` like every
    // other undeclared error, so `ok: false` keeps meaning one thing only.
    const typed = createEventTypedFetch(() => undefined)

    const result = await settled(() => typed.safe('/api/anything'))

    expect(result.threw).toBe(true)
    expect(result.value).toBeInstanceOf(EventFetchUnavailableError)
  })

  it('checks once: a verified wrapper does not re-police later replacements', async () => {
    // The check exists to name the skew that removed the property, not to
    // guard every read — after one successful call a replacement that breaks
    // `event.$fetch` fails as vanilla would, not with the skew error.
    let base: ReturnType<typeof fakeEventFetch> | undefined = fakeEventFetch()
    const typed = createEventTypedFetch(() => base)

    await typed('/api/anything')

    base = undefined

    const result = await settled(() => typed('/api/anything'))

    expect(result.threw).toBe(true)
    expect(result.value).not.toBeInstanceOf(EventFetchUnavailableError)
  })
})
