import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DECLARED_ERROR_KEY, declaredError } from '../src/runtime/shared'

/**
 * Layer 4 (SPEC.md §9.1): the wire, against a **real built server**.
 *
 * The envelope was derived from Nitro's and h3's source, and every type-level
 * claim about it is asserted at layer 1 — but neither of those runs it. This
 * file runs it. Its job is to prove the envelope crosses the wire, not to
 * re-prove types, which is why it stays small.
 *
 * The playground is the fixture because it consumes the module through its real
 * published specifiers, which is also why the package-level `turbo.json` gives
 * `test` a dependency on this package's own `build` (SPEC.md §8.2).
 *
 * Expectations are derived from `DECLARED_ERROR_KEY` rather than restating the
 * literal — the key is frozen protocol, and nothing but the constant's own
 * declaration should ever spell it (SPEC.md §5.2).
 */
describe('the declared-failure wire format', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../playground', import.meta.url)),
    server: true,
    browser: false,
  })

  it('is an ordinary HTTP error whose reason phrase is the tag', async () => {
    const response = await fetch('/api/users/suspended', {
      headers: { accept: 'application/json' },
    })

    expect(response.status).toBe(403)
    // Nitro substitutes "Server Error" for an unset `statusMessage`, so leaving
    // it off would make every declared failure report that as its HTTP reason
    // phrase (SPEC.md §5.2).
    expect(response.statusText).toBe('user-suspended')

    // The body, exactly as SPEC.md §5.1 specifies it — `toEqual` rather than
    // `toMatchObject`, so an extra key is a failure too.
    //
    // One correction to §5.1's worked example, measured here: Nitro 2.13.4
    // writes `url` as the **absolute** request URL, not the path. The example
    // shows a path. Nothing else differs, and nothing reads `url`.
    expect(await response.json()).toEqual({
      error: true,
      url: expect.stringMatching(/\/api\/users\/suspended$/),
      statusCode: 403,
      statusMessage: 'user-suspended',
      message: 'user-suspended',
      data: {
        [DECLARED_ERROR_KEY]: {
          tag: 'user-suspended',
          status: 403,
          until: '2026-12-31',
        },
      },
    })
  })

  it('arrives at err.data.data.__declaredError__ through a client fetch', async () => {
    const error = await rejectionOf('/api/users/missing')

    expect(error, 'a declared failure must reject, not resolve').toBeDefined()

    // Three hops: ofetch defines `FetchError.data` as a getter over the whole
    // response body, and `createError` copies `input.data` wholesale
    // (SPEC.md §5.2).
    expect(error.data.data[DECLARED_ERROR_KEY]).toEqual({
      tag: 'user-not-found',
      status: 404,
      userId: 'missing',
    })

    // `data` surviving at all is the observable half of "fatal and unhandled
    // are left alone": this is a production build, and Nitro's prod serializer
    // wipes `data` entirely whenever `unhandled || fatal` (SPEC.md §6.5).
    expect(error.statusCode).toBe(404)
  })

  it('leaves a framework error sharing the status unmarked and untouched', async () => {
    // `/api/boom` throws a hand-rolled 403 — the same status as the declared
    // `user-suspended` — carrying `data` of its own. This is the assertion the
    // whole wire format exists for: the discriminator is marker presence, not
    // status (SPEC.md §5.2).
    const error = await rejectionOf('/api/boom')

    expect(error, 'a framework error must still reject').toBeDefined()
    expect(error.statusCode).toBe(403)
    expect(error.data?.data?.[DECLARED_ERROR_KEY]).toBeUndefined()
    // Its own `data` is intact. The module adds a lane; it does not redirect
    // the existing one.
    expect(error.data?.data).toEqual({ reason: 'hand-rolled' })
  })

  it('resolves a tag through a composed, narrowed catalogue', async () => {
    // `/api/users/[id]` composes two catalogues and narrows the second with
    // `.pick('forbidden')`. Nothing else exercises the runtime half of
    // composition — the lookup that walks the catalogues in order — or proves
    // that a picked catalogue still answers for the tags it kept.
    const error = await rejectionOf('/api/users/private')

    expect(error).toBeDefined()
    expect(error.statusCode).toBe(403)
    expect(error.data.data[DECLARED_ERROR_KEY]).toEqual({
      tag: 'forbidden',
      status: 403,
      requiredRole: 'owner',
    })
  })

  it('keeps the declared status authoritative when h3 rewrites the HTTP one', async () => {
    // `/api/rogue-status` declares 1042, which `sanitizeStatusCode` refuses to
    // put on the wire. The HTTP status and the declared status genuinely
    // disagree, and the copy inside the marker is the one the generated type
    // promised (SPEC.md §5.3).
    const error = await rejectionOf('/api/rogue-status')

    expect(error).toBeDefined()
    expect(error.statusCode).toBe(500)
    expect(error.data.data[DECLARED_ERROR_KEY]).toEqual({
      tag: 'out-of-range',
      status: 1042,
      declared: 1042,
    })
  })

  it('is read back off the wire by the reader, with no key written', async () => {
    // The one and only read path (SPEC.md §3.7), against a value that really
    // crossed a socket rather than one assembled in a test. `test/reader.test.ts`
    // proves the guard rejects malformed markers; this proves the address it
    // walks is the address the wire actually uses.
    expect(declaredError(await rejectionOf('/api/users/missing'))).toEqual({
      tag: 'user-not-found',
      status: 404,
      userId: 'missing',
    })

    // And a framework error sharing the status is not one, by presence.
    expect(declaredError(await rejectionOf('/api/boom'))).toBeUndefined()
  })

  it('reads a production-stripped escaped callee as undeclared', async () => {
    // SPEC.md §6.5, which is observable **only** against a production build:
    // `/api/escaped-callee` lets a callee's declared failure escape, so
    // `toNodeListener` marks it `unhandled`, Nitro's prod serializer applies
    // `isSensitive = unhandled || fatal` and wipes `data` outright.
    const error = await rejectionOf('/api/escaped-callee')

    expect(error).toBeDefined()

    // The reassuring half: the envelope cannot leak through this path, and the
    // callee's declared failure degrades to an undeclared one — the safe
    // direction, for free. `data` is gone from the body outright, which is the
    // only reason the marker is not there; even unmasked it would have sat at
    // `err.data.data.data.__declaredError__`, one hop deeper than the reader
    // reads.
    expect(declaredError(error)).toBeUndefined()
    expect(error.data).not.toHaveProperty('data')
    expect(error.data.message).toBe('Server Error')

    // The half that is not reassuring, and that SPEC.md §6.5 says the module
    // deliberately does nothing about: `statusMessage` is **not** gated by
    // `isSensitive`, and it still carries the *callee's* internal tag — as the
    // HTTP reason phrase, all the way to the caller's client. This is
    // byte-for-byte what plain `$fetch` between handlers already does; the
    // module did not introduce it and normalising it would break the
    // typings-only lock. The shipped answer is one line of guidance: prefer
    // `.safe()` server-to-server.
    expect(error.data.statusMessage).toBe('user-not-found')
    expect(error.statusCode).toBe(404)
  })

  it('composes event.$typedFetch with a later replacement of event.$fetch', async () => {
    // SPEC.md §3.6: the wrapper reads `event.$fetch` through a thunk rather
    // than capturing it, so it composes with anything that replaces
    // `event.$fetch` later in the same hook chain. The playground carries that
    // "anything" as a fixture: `server/plugins/fetch-replacer.ts` replaces
    // `event.$fetch` in a `request` hook that runs after the module's (scanned
    // `server/plugins` register after `addServerPlugin`'s), stamping
    // `x-fetch-replaced` on every call made through the replacement. The
    // probe's internal hop must carry the stamp — capturing `event.$fetch` at
    // hook time instead reads `absent` here (mutation run).
    expect(await $fetch('/api/fetch-replacer-probe')).toEqual({
      marker: 'by-fixture',
    })

    // The control: the same echo reached directly over HTTP made no internal
    // hop, so the replacement had nothing to stamp — the marker above is the
    // fixture's doing, not something ambient in the transport.
    expect(await $fetch('/api/fetch-replacer-echo')).toEqual({
      marker: 'absent',
    })
  })

  it('leaves the success path completely alone', async () => {
    // The same route, same handler, no annotation anywhere: `fail` returning
    // `never` is what keeps the declared union out of this.
    expect(await $fetch('/api/users/42')).toEqual({
      id: '42',
      name: 'User 42',
      email: '42@example.com',
    })
  })
})

/**
 * The rejected value of a fetch, as the client actually receives it.
 *
 * `any` because that is the honest type: this file's whole job is to check what
 * arrives at a caller who has no generated types yet, so nothing here may lean
 * on the shape it is trying to prove.
 */
async function rejectionOf(path: string, options?: any): Promise<any> {
  return $fetch(path, options).then(
    () => undefined,
    (thrown: unknown) => thrown
  )
}
