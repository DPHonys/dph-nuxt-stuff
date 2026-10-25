import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect, it } from 'vitest'

/**
 * The fetch family's wire, in one copy, run by `fetch-wire.test.ts` against a
 * production build and `fetch-wire-dev.test.ts` against a dev server. The
 * fixture is `test/fixtures/fetch`: its relay routes call `$betterFetch` and
 * `event.$betterFetch` from inside the server and report what came back.
 */

/** The route's Known error, as `.try` hands it over. */
const ORDER_NOT_FOUND = { _tag: 'order-not-found', id: 404 }

/** The JSON a `<pre>` of the fixture's page rendered, unescaped. */
function renderedJson(html: string, id: string): string {
  const escaped =
    new RegExp(`<pre id="${id}">(.*?)</pre>`, 's').exec(html)?.[1] ?? ''

  return escaped
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

/** An error ref as the fixture's page reports it. */
interface ReportedErrorRef {
  readonly nuxtError: boolean
  readonly statusCode: number
  /** The error's `data`: the whole Nitro error body of the failed fetch. */
  readonly body: unknown
}

/** An error ref holding the `NuxtError` of a fetched Known error. */
function knownErrorRef(tagged: { _tag: string }): ReportedErrorRef {
  return {
    nuxtError: true,
    statusCode: 404,
    body: expect.objectContaining({
      statusCode: 404,
      message: tagged._tag,
      data: tagged,
    }),
  }
}

/** What both relays report alike. */
const OBSERVED = {
  order: { id: 7 },
  missing: ORDER_NOT_FOUND,
  // From `server/routes/`, answered as JSON because the family asked for it.
  legacy: ORDER_NOT_FOUND,
  unavailable: { _tag: 'request-failed', status: 503 },
}

export function theFetchWire(): void {
  it('$betterFetch answers, and .try classifies every failure, from a Nitro handler', async () => {
    expect(await $fetch('/api/relay/global')).toEqual({
      ...OBSERVED,
      // The global is no request's: it forwards no cookie.
      echoed: { accept: 'application/json', cookie: null },
      ownAccept: { accept: 'text/plain', cookie: null },
    })
  })

  it('event.$betterFetch does the same, forwarding the request’s cookies', async () => {
    expect(
      await $fetch('/api/relay/event', { headers: { cookie: 'session=abc' } })
    ).toEqual({
      ...OBSERVED,
      echoed: { accept: 'application/json', cookie: 'session=abc' },
      ownAccept: { accept: 'text/plain', cookie: 'session=abc' },
    })
  })

  it('$betterFetch answers during server-side rendering', async () => {
    expect(
      JSON.parse(renderedJson(await $fetch<string>('/'), 'rendered'))
    ).toEqual({
      order: { id: 7 },
      missing: ORDER_NOT_FOUND,
    })
  })

  // Each error ref is reported as `{ nuxtError, statusCode, body }`, `body`
  // being the error's `data`: the whole Nitro error body of the failed fetch.
  it('every composable answers during server-side rendering, a Known error reaching its error ref intact', async () => {
    const html = await $fetch<string>('/', {
      headers: { cookie: 'session=abc' },
    })

    expect(JSON.parse(renderedJson(html, 'composables'))).toEqual({
      useBetterFetch: {
        data: { id: 7 },
        error: knownErrorRef(ORDER_NOT_FOUND),
        // During rendering `useFetch` forwards the rendered request's cookie.
        echoed: { accept: 'application/json', cookie: 'session=abc' },
      },
      // From `server/routes/`, answered as JSON because the composable asked.
      useLazyBetterFetch: { error: knownErrorRef(ORDER_NOT_FOUND) },
      useBetterAsyncData: {
        // Two keyless calls, each with its own key and its own answer.
        data: { id: 7 },
        // Not Nuxt's `500` around a plain object: the error the fetch threw.
        error: knownErrorRef(ORDER_NOT_FOUND),
        // `useRequestBetterFetch` is the rendered request's own fetch.
        echoed: { accept: 'application/json', cookie: 'session=abc' },
      },
      // The Request-failed variant's own error, with the response's status.
      useLazyBetterAsyncData: {
        error: {
          nuxtError: true,
          statusCode: 503,
          body: expect.objectContaining({
            statusCode: 503,
            message: 'down for maintenance',
          }),
        },
      },
    })
  })

  // Why the family forces the header: outside `/api/**` Nitro answers an
  // error as JSON only when asked for JSON, and an HTML page carries no
  // Tagged error to classify.
  it('gets a JSON Known error outside /api/** only by asking for JSON', async () => {
    const page = await fetch('/legacy/404', {
      headers: { accept: 'text/html' },
    })

    expect(page.status).toBe(404)
    expect(page.headers.get('content-type')).toMatch(/^text\/html/)

    const json = await fetch('/legacy/404', {
      headers: { accept: 'application/json' },
    })

    expect(json.status).toBe(404)
    expect(await json.json()).toMatchObject({ data: ORDER_NOT_FOUND })
  })
}
