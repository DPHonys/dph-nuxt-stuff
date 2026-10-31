import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect, it } from 'vitest'
import { recognizeKnownError } from '../../src/runtime/server'
import { matchError } from '../../src/runtime/shared'
import { toTryResult } from '../../src/runtime/shared/errors/try-result'
import { toNuxtError } from '../../src/runtime/shared/h3'

/**
 * The Known-error wire, in one copy, run by `errors-wire.test.ts` against a
 * production build and `errors-wire-dev.test.ts` against a dev server, so
 * "identical in development and production" is asserted by there being one.
 * The fixture is `test/fixtures/errors`.
 */

/** Keys Nitro adds to an error body that this package does not own. */
export interface NitroExtras {
  /** The dev server's stack frames; a production build sends none. */
  readonly stack?: readonly string[]
}

/** Nitro's error envelope around a Tagged error, as a client reads it. */
interface KnownErrorBody<Fields> extends NitroExtras {
  readonly error: true
  readonly url: string
  readonly statusCode: number
  readonly statusMessage: string
  readonly message: string
  readonly data: { readonly _tag: string } & Fields
}

/** What `/api/observed` reports, one entry per error the hook saw. */
interface Observed {
  readonly tag?: string
  readonly status?: number
}

/**
 * The rejected value of a fetch, as a client receives it. `any` because this
 * file checks what arrives, so nothing here may lean on the shape it proves.
 */
async function rejectionOf(path: string): Promise<any> {
  return $fetch(path).then(
    () => undefined,
    (thrown) => thrown
  )
}

export function theErrorsWire(nitroExtras: NitroExtras): void {
  // Nitro's ordinary error body, whole, so an extra key fails too: no wrapper
  // key, no `status` inside `data`. `statusMessage` is Nitro's own, so it is
  // never pinned to anything this package wrote.
  function knownErrorBody<Fields extends object>(
    path: string,
    status: number,
    tag: string,
    fields: Fields
  ): KnownErrorBody<Fields> {
    return {
      ...nitroExtras,
      error: true,
      url: expect.stringMatching(new RegExp(`${path}$`)),
      statusCode: status,
      statusMessage: expect.any(String),
      message: tag,
      data: { _tag: tag, ...fields },
    }
  }

  it('sends a schema-bearing error with its status, its tag and its fields', async () => {
    const response = await fetch('/api/orders/404')

    expect(response.status).toBe(404)

    const body = await response.json()

    expect(body).toEqual(
      knownErrorBody('/api/orders/404', 404, 'order-not-found', { id: 404 })
    )
    expect(body.statusMessage).not.toBe('order-not-found')
  })

  it('sends a schema-less error as its tag alone', async () => {
    const response = await fetch('/api/orders/locked')

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(
      knownErrorBody('/api/orders/locked', 409, 'order-locked', {})
    )
  })

  it('sends an Effect error class instance, thrown as-is, as declared', async () => {
    const response = await fetch('/api/effect')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(
      knownErrorBody('/api/effect', 404, 'OrderMissing', { id: 7 })
    )
  })

  it('sends every caller the same body, whatever headers it sends', async () => {
    const bare = await fetch('/api/orders/404')
    const dressed = await fetch('/api/orders/404', {
      headers: {
        accept: 'application/json',
        // The retired channel header, a cookie and a credential: no header
        // decides what a Known error carries.
        'x-known-error-channel': 'playground-channel',
        cookie: 'session=1',
        authorization: 'Bearer token',
      },
    })

    expect(dressed.status).toBe(bare.status)
    expect(await dressed.json()).toEqual(await bare.json())
  })

  it('reaches a client fetch at error.data.data', async () => {
    const error = await rejectionOf('/api/orders/404')

    expect(error, 'a Known error must reject, not resolve').toBeDefined()
    expect(error.statusCode).toBe(404)
    // ofetch's `data` is the whole body; the Tagged error is its `data`.
    expect(error.data.data).toEqual({ _tag: 'order-not-found', id: 404 })
  })

  it('is read by the try classifier as the Tagged error, and nothing else is', async () => {
    expect(await toTryResult(() => $fetch('/api/orders/404'))).toEqual({
      data: undefined,
      error: { _tag: 'order-not-found', id: 404 },
    })
    expect(await toTryResult(() => $fetch('/api/effect'))).toEqual({
      data: undefined,
      error: { _tag: 'OrderMissing', id: 7 },
    })

    // A hand-rolled error's `data` carries no `_tag`: not a Known error.
    const foreign = await toTryResult(() => $fetch('/api/foreign'))

    expect(foreign.error).toMatchObject({ _tag: 'request-failed', status: 403 })
  })

  it('is matched by its tag from the fetched error', async () => {
    const seen: string[] = []

    matchError(
      toNuxtError(await rejectionOf('/api/orders/locked')),
      { 'request-failed': () => seen.push('request-failed') },
      (tagged) => seen.push(tagged._tag)
    )

    // Typed as a route declaring nothing, so the tag reaches the fallback.
    expect(seen).toEqual(['order-locked'])
  })

  it('leaves a hand-rolled error’s own data untouched', async () => {
    const response = await fetch('/api/foreign')

    expect(response.status).toBe(403)
    expect((await response.json()).data).toEqual({ reason: 'hand-rolled' })
  })

  it('is recognised by recognizeKnownError in an error hook', async () => {
    await fetch('/api/orders/404')
    await fetch('/api/effect')

    const observed = await $fetch<Observed[]>('/api/observed')

    expect(observed).toContainEqual({ tag: 'order-not-found', status: 404 })
    expect(observed).toContainEqual({ tag: 'OrderMissing', status: 404 })
  })

  it('does not recognise a callee’s Known error a caller let escape', async () => {
    const before = await $fetch<Observed[]>('/api/observed')
    const error = await rejectionOf('/api/escaped')

    // The callee's status line leaks as the caller's answer; its tag sits one
    // level further down, if the server sends `data` at all.
    expect(error.statusCode).toBe(404)
    expect(error.data.data?._tag).not.toBe('order-not-found')
    expect(recognizeKnownError(error)).toBeUndefined()

    const after = await $fetch<Observed[]>('/api/observed')

    // The hook sees the callee's own Known error, recognised, and then the
    // caller's escape of it, which is not.
    expect(after.slice(before.length)).toEqual([
      { tag: 'order-not-found', status: 404 },
      { status: 404 },
    ])
  })

  it('leaves the success path alone', async () => {
    expect(await $fetch('/api/orders/7')).toEqual({ id: 7, total: 42 })
  })
}
