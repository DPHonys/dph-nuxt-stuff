import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { recognizeKnownError } from '../../src/runtime/server'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared/wire'

// The wire, against a real built server. The playground is the fixture
// because it consumes the module through its real published specifiers -
// which is why this package's `turbo.json` gives `test` a dependency on its
// own `build`. Expectations derive from the two protocol constants rather
// than restating them.

/** What `playground/nuxt.config.ts` configures. Gating is on for this app. */
const TOKEN = 'playground-channel'

/** A first-party call: the header every checked surface attaches for itself. */
const firstParty = {
  accept: 'application/json',
  [CHANNEL_HEADER]: TOKEN,
}

describe('the known-failure wire', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    server: true,
    browser: false,
  })

  it('carries the marker under `data` on an ordinary HTTP error', async () => {
    const response = await fetch('/api/users/suspended', {
      headers: firstParty,
    })

    expect(response.status).toBe(403)

    const body = await response.json()

    // The whole body, so an extra key fails too. The tag must never ride
    // `statusMessage`, and asserting a literal there would make writing one
    // look correct.
    expect(body).toEqual({
      error: true,
      url: expect.stringMatching(/\/api\/users\/suspended$/),
      statusCode: 403,
      statusMessage: expect.any(String),
      message: 'user-suspended',
      data: {
        [KNOWN_ERROR_KEY]: {
          tag: 'user-suspended',
          status: 403,
          until: '2026-12-31',
        },
      },
    })

    expect(body.statusMessage).not.toBe('user-suspended')
  })

  it('arrives at err.data.data.__knownError__ through a client fetch', async () => {
    const error = await rejectionOf('/api/users/missing', firstParty)

    expect(error, 'a known failure must reject, not resolve').toBeDefined()

    // Depth 2, both `data`s the framework's: Nitro's serializer puts
    // `error.data` under `data`, and ofetch's `FetchError.data` is the whole
    // parsed body.
    expect(error.data.data[KNOWN_ERROR_KEY]).toEqual({
      tag: 'user-not-found',
      status: 404,
      userId: 'missing',
    })

    // `data` surviving at all is the observable half of "`fatal`/`unhandled`
    // are left alone": the prod serializer wipes `data` outright for either.
    expect(error.statusCode).toBe(404)
  })

  it('strips the marker for a caller that is not the app', async () => {
    const response = await fetch('/api/users/missing', {
      headers: { accept: 'application/json' },
    })

    const body = await response.json()

    // The status line is intact - a third party gets an ordinary error
    // response, not a broken one.
    expect(response.status).toBe(404)
    expect(body.statusCode).toBe(404)
    expect(JSON.stringify(body)).not.toContain(KNOWN_ERROR_KEY)
    expect(body.data).toBeUndefined()
  })

  it('leaves a foreign error’s own data untouched on both channels', async () => {
    // `/api/boom` throws a hand-rolled 403 carrying `data` of its own: the
    // discriminator is marker presence, not status.
    for (const headers of [firstParty, { accept: 'application/json' }]) {
      const response = await fetch('/api/boom', { headers })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.data).toEqual({ reason: 'hand-rolled' })
    }
  })

  it('scrubs an escaped callee’s variant and leaks its status line', async () => {
    // `/api/escaped-callee` lets a callee's known failure escape. h3 marks it
    // `unhandled`, so the prod serializer wipes `data` - while `status`
    // passes through as this route's own answer.
    const error = await rejectionOf('/api/escaped-callee', firstParty)

    expect(error).toBeDefined()
    expect(error.statusCode).toBe(404)
    expect(error.data.message).toBe('Server Error')
    expect(error.data.data).toBeUndefined()
    expect(recognizeKnownError(error)).toBeUndefined()
  })

  it('translates an upstream failure through the matcher’s arms', async () => {
    // `/api/chain/b` calls `/api/chain/c` with `.try`, and the `c-gone` arm
    // throws this route's own 410.
    const translated = await rejectionOf('/api/chain/b?mode=gone', firstParty)

    expect(translated.statusCode).toBe(410)
    expect(translated.data.message).toBe('upstream gone: gone')
    // The callee's variant is not forwarded.
    expect(recognizeKnownError(translated)).toBeUndefined()

    // The success path of the same two hops, with the outer request's cookie
    // read off the deepest handler's event - context forwarding, measured.
    expect(
      await $fetch('/api/chain/b', { headers: { cookie: 'probe=chocolate' } })
    ).toEqual({ ok: true, cookie: 'chocolate' })
  })

  it('serves the server surfaces from one Nitro handler', async () => {
    const body = await $fetch<{
      declared: string
      undeclared: string
      cookieViaEvent: string
      cookieViaGlobal: string
    }>('/api/probe', { headers: { cookie: 'probe=chocolate' } })

    // One `toEqual`: the interesting mutations move more than one field.
    expect(body).toEqual({
      declared: 'userSuspended until 2026-12-31',
      undeclared: 'unknown: 403',
      // The event-bound instance forwards the request's identity …
      cookieViaEvent: 'chocolate',
      // … and the global, which is the control, forwards nothing.
      cookieViaGlobal: 'none',
    })
  })

  it('renders every app surface under SSR', async () => {
    const html = await $fetch<string>('/')

    // `useCheckedFetch` + `matchError`, with the arms exhaustive.
    expect(html).toContain('userSuspended until 2026-12-31')
    // `useCheckedAsyncData` over a repository built on `$checkedFetch.try`.
    expect(html).toContain('forbidden, needs owner')
    // The imperative shape: `.try` inside a function that can return.
    expect(html).toContain('c-gone: gone')
    // A degraded call site - a throwing `useAsyncData` handler - reading the
    // tag off the fallback's second parameter.
    expect(html).toContain('user-not-found/404')
    // Vanilla `useFetch` attaches no channel tag, so with gating on its
    // response comes back stripped and nothing is recognized.
    expect(html).toContain('unknown: 404')
  })

  it('keeps the marker across hydration', async () => {
    // AsyncData errors ride the payload serialized through `H3Error.toJSON()`
    // (which includes `data`) and revived client-side through `createError`,
    // so the matcher works on a hydrated error unchanged.
    const html = await $fetch<string>('/')

    expect(html).toContain(KNOWN_ERROR_KEY)
    expect(html).toContain('forbidden')
  })

  it('reports to the error hook whatever the response withholds', async () => {
    // The Sentry-stability rule: the thrown error always carries the marker;
    // only the serialized response is ever stripped.
    await fetch('/api/users/limited', {
      headers: { accept: 'application/json' },
    })
    await rejectionOf('/api/escaped-callee', firstParty)

    const observed =
      await $fetch<{ tag: string; status: number; unhandled: boolean }[]>(
        '/api/observed'
      )

    // The tokenless request whose response went out stripped.
    expect(observed).toContainEqual({
      tag: 'rate-limited',
      status: 429,
      unhandled: false,
    })

    // A route's own declared failure is `unhandled: false` and filterable; the
    // same variant escaping a caller reports as the caller bug it is.
    expect(observed).toContainEqual({
      tag: 'user-not-found',
      status: 404,
      unhandled: true,
    })
  })

  it('leaves the success path completely alone', async () => {
    expect(await $fetch('/api/users/42')).toEqual({
      id: '42',
      name: 'User 42',
      email: '42@example.com',
    })
  })
})

/**
 * The rejected value of a fetch, as the client actually receives it. `any`
 * because this file checks what arrives at a caller, so nothing here may lean
 * on the shape it is proving.
 */
async function rejectionOf(
  path: string,
  headers: Record<string, string>
): Promise<any> {
  return $fetch(path, { headers }).then(
    () => undefined,
    (thrown: unknown) => thrown
  )
}
