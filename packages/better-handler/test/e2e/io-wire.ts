import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect, it } from 'vitest'
import { matchError } from '../../src/runtime/shared'
import { toTryResult } from '../../src/runtime/shared/errors/try-result'
import { toNuxtError } from '../../src/runtime/shared/h3'
import type { NitroExtras } from './errors-wire'

/**
 * The io half's wire, in one copy, run by `io-wire.test.ts` against a
 * production build and `io-wire-dev.test.ts` against a dev server, so
 * "identical in development and production" is asserted by there being one.
 * The fixture is `test/fixtures/io`.
 */

/** One projected issue, as a client reads it. */
interface Issue {
  readonly source: string
  readonly message: string
  readonly path: ReadonlyArray<string | number>
}

/** Nitro's error envelope around the Built-in validation-failed variant. */
interface ValidationFailedBody extends NitroExtras {
  readonly error: true
  readonly url: string
  readonly statusCode: 400
  readonly statusMessage: string
  readonly message: 'validation-failed'
  readonly data: {
    readonly _tag: 'validation-failed'
    readonly issues: readonly Issue[]
  }
}

/** What `/api/observed` reports, one entry per error the hook saw. */
interface Observed {
  readonly tag?: string
  readonly status?: number
}

/** A POST carrying an already-serialized payload, malformed or not. */
function post(payload: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  }
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

export function theInputWire(nitroExtras: NitroExtras): void {
  // Nitro's ordinary error body, whole, so an extra key fails too: no
  // wrapper key, no `status` inside `data`, and no reason phrase of ours.
  function validationFailedBody(
    path: string,
    issues: readonly Issue[]
  ): ValidationFailedBody {
    return {
      ...nitroExtras,
      error: true,
      // The path asked, query included, ending the URL Nitro reports.
      url: expect.stringMatching(
        new RegExp(`${path.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
      ),
      statusCode: 400,
      statusMessage: expect.any(String),
      message: 'validation-failed',
      data: { _tag: 'validation-failed', issues },
    }
  }

  it('hands each source’s schema output to the Handler, coercions applied', async () => {
    expect(await $fetch('/api/orders/7')).toEqual({ id: 7 })
    expect(await $fetch('/api/search?page=2')).toEqual({ page: 2 })
    expect(
      await $fetch('/api/traced', { headers: { 'X-Trace': 'abc' } })
    ).toEqual({ trace: 'abc' })
    expect(
      await $fetch('/api/users', {
        method: 'POST',
        body: { name: 'ada', age: 36 },
      })
    ).toEqual({ created: 'ada', age: 36 })
  })

  it('merges a composed tuple’s outputs into one value', async () => {
    expect(await $fetch('/api/reports?page=3&sort=desc')).toEqual({
      page: 3,
      sort: 'desc',
    })
  })

  it('sends a rejected route param as validation-failed, 400', async () => {
    const response = await fetch('/api/orders/seven')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      validationFailedBody('/api/orders/seven', [
        {
          source: 'route',
          message: 'order id must be a whole number',
          path: ['id'],
        },
      ])
    )
  })

  it('sends a rejected query, a header and a body the same way', async () => {
    const query = await fetch('/api/search?page=two')
    const headers = await fetch('/api/traced')
    const body = await fetch('/api/users', post('{"name":"","age":12}'))

    expect(await query.json()).toEqual(
      validationFailedBody('/api/search?page=two', [
        {
          source: 'query',
          message: 'page must be a whole number',
          path: ['page'],
        },
      ])
    )
    expect(await headers.json()).toEqual(
      validationFailedBody('/api/traced', [
        { source: 'headers', message: expect.any(String), path: ['x-trace'] },
      ])
    )
    // Every issue of the one source, together.
    expect(await body.json()).toEqual(
      validationFailedBody('/api/users', [
        { source: 'body', message: 'name is required', path: ['name'] },
        { source: 'body', message: 'age must be at least 18', path: ['age'] },
      ])
    )
  })

  it('sends a body that is no JSON as one body issue', async () => {
    const response = await fetch('/api/users', post('{ not json at all'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      validationFailedBody('/api/users', [
        {
          source: 'body',
          message: 'Request body could not be parsed',
          path: [],
        },
      ])
    )
  })

  it('stops at the first failing source, never reading the body after it', async () => {
    const response = await fetch(
      '/api/users?dryRun=maybe',
      post('{ not json at all')
    )
    const body: ValidationFailedBody = await response.json()

    expect(body.data.issues.map(({ source }) => source)).toEqual(['query'])
  })

  it('sends every issue of a composed tuple together', async () => {
    const response = await fetch('/api/reports?page=x&sort=sideways')

    expect(await response.json()).toEqual(
      validationFailedBody('/api/reports?page=x&sort=sideways', [
        {
          source: 'query',
          message: 'page must be a whole number',
          path: ['page'],
        },
        {
          source: 'query',
          message: 'sort must be asc or desc',
          path: ['sort'],
        },
      ])
    )
  })

  it('leaves a declared error of the same route its own wire', async () => {
    const response = await fetch('/api/orders/404')

    expect(response.status).toBe(404)
    expect((await response.json()).data).toEqual({ _tag: 'order-not-found' })
  })

  it('reaches a client fetch at error.data.data', async () => {
    const error = await rejectionOf('/api/search?page=two')

    expect(error, 'a validation failure must reject, not resolve').toBeDefined()
    expect(error.statusCode).toBe(400)
    expect(error.data.data).toEqual({
      _tag: 'validation-failed',
      issues: [
        {
          source: 'query',
          message: 'page must be a whole number',
          path: ['page'],
        },
      ],
    })
  })

  it('is read by the try classifier as the Tagged error', async () => {
    expect(await toTryResult(() => $fetch('/api/search?page=two'))).toEqual({
      data: undefined,
      error: {
        _tag: 'validation-failed',
        issues: [
          {
            source: 'query',
            message: 'page must be a whole number',
            path: ['page'],
          },
        ],
      },
    })
  })

  it('is matched by its tag from the fetched error', async () => {
    const seen: string[] = []

    matchError(
      toNuxtError(await rejectionOf('/api/orders/seven')),
      { 'request-failed': () => seen.push('request-failed') },
      (tagged) => seen.push(tagged._tag)
    )

    // Typed as a route declaring nothing, so the tag reaches the fallback.
    expect(seen).toEqual(['validation-failed'])
  })

  it('is recognised by recognizeKnownError in an error hook', async () => {
    const before = await $fetch<Observed[]>('/api/observed')

    await fetch('/api/search?page=two')
    await fetch('/api/orders/404')

    const after = await $fetch<Observed[]>('/api/observed')

    expect(after.slice(before.length)).toEqual([
      { tag: 'validation-failed', status: 400 },
      { tag: 'order-not-found', status: 404 },
    ])
  })

  it('answers an unmergeable tuple with a plain 500, no Known error', async () => {
    const before = await $fetch<Observed[]>('/api/observed')
    const response = await fetch('/api/unmergeable?q=x')

    expect(response.status).toBe(500)
    expect((await response.json()).data).toBeUndefined()

    const after = await $fetch<Observed[]>('/api/observed')

    expect(after.slice(before.length)).toEqual([{ status: 500 }])
  })
}

/**
 * The output half's wire, in one copy for both servers as the input half's
 * is: the bare form answering `200`, a mapped status and bodiless ones.
 */
export function theOutputWire(): void {
  it('answers the bare form 200, whatever status the Handler set', async () => {
    const response = await fetch('/api/receipts')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'r-1', total: 3 })
  })

  it('answers a mapped status with its body', async () => {
    const response = await fetch('/api/receipts', { method: 'POST' })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: 'r-2', total: 5 })
  })

  it('answers a status declared null with no body', async () => {
    const response = await fetch('/api/receipts?dryRun=yes', {
      method: 'POST',
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('content-type')).toBeNull()
    expect(await response.text()).toBe('')
  })

  // h3 alone answers a `null` under `200` with a `204`, a status neither
  // route declares.
  it('answers a 200 declared null with 200 and no body', async () => {
    const response = await fetch('/api/receipts', { method: 'PUT' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBeNull()
    expect(await response.text()).toBe('')
  })

  it('answers the bare form’s null with 200 and no body', async () => {
    const response = await fetch('/api/receipts/latest')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBeNull()
    expect(await response.text()).toBe('')
  })
}
