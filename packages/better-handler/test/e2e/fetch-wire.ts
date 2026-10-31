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

  // A cached handler runs on an event Nitro makes itself, after every
  // `request` hook, forwarding only the headers the cache varies on.
  it('event.$betterFetch reaches the event a cached handler runs on', async () => {
    expect(
      await $fetch('/api/relay/cached', { headers: { cookie: 'session=abc' } })
    ).toEqual({
      ...OBSERVED,
      echoed: { accept: 'application/json', cookie: null },
      ownAccept: { accept: 'text/plain', cookie: null },
    })
  })

  it('$betterFetch answers during server-side rendering', async () => {
    const html = await $fetch<string>('/')
    const rendered = /<pre id="rendered">(.*?)<\/pre>/s.exec(html)?.[1] ?? ''

    expect(JSON.parse(rendered.replaceAll('&quot;', '"'))).toEqual({
      order: { id: 7 },
      missing: ORDER_NOT_FOUND,
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
