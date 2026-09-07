import { CHANNEL_HEADER } from '@dphonys/nuxt-handler-errors/internals/shared'
import { VALIDATION_ERROR_KEY } from '@dphonys/nuxt-handler-validation/internals/shared'
import type { ValidationIssue } from '@dphonys/nuxt-handler-validation/types'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect, it } from 'vitest'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared'

/**
 * The umbrella's wire, in one copy, run by `wire.test.ts` against a
 * production build and `wire-dev.test.ts` against a dev server: the delta
 * the umbrella adds over its parents, plus one smoke per parent asserted
 * against that parent's own expectations.
 */

/** What `playground/nuxt.config.ts` configures. Gating is on for this app. */
const TOKEN = 'playground-channel'

/** A first-party call: the header every checked surface attaches for itself. */
const firstParty = { accept: 'application/json', [CHANNEL_HEADER]: TOKEN }

/** A caller that is not the app. */
const thirdParty = { accept: 'application/json' }

/**
 * The validation marker's key as it would read if it ever reached a client,
 * derived rather than restated so a rename cannot leave this passing.
 */
const VALIDATION_MARKER: string = VALIDATION_ERROR_KEY.description ?? ''

/** What `/api/search?page=nope` produces. */
const BAD_PAGE: ValidationIssue = {
  source: 'query',
  message: 'page must be a whole number',
  path: ['page'],
}

/** The validation parent's own wording for a body the request made unreadable. */
const UNPARSEABLE_BODY: ValidationIssue = {
  source: 'body',
  message: 'Request body could not be parsed',
  path: [],
}

/**
 * Keys Nitro adds to an error body that this package does not own: a dev
 * server's trimmed stack lines, nothing in production.
 */
export interface NitroExtras {
  stack?: string[]
}

/** Nitro's production error envelope, as `toEqual` sees it. */
interface ErrorEnvelope extends NitroExtras {
  error: true
  url: string
  statusCode: number
  statusMessage: string
  message: string
  data: {
    issues: ValidationIssue[]
    [KNOWN_ERROR_KEY]: {
      tag: string
      status: number
      issues: ValidationIssue[]
    }
  }
}

export function theTypedWire(nitroExtras: NitroExtras): void {
  /** Nitro's envelope around the built-in variant, as a first party sees it. */
  const variantBody = (issues: ValidationIssue[]): ErrorEnvelope => ({
    ...nitroExtras,
    error: true,
    url: expect.any(String),
    statusCode: 400,
    statusMessage: expect.any(String),
    message: 'validation-failed',
    data: {
      issues,
      [KNOWN_ERROR_KEY]: { tag: 'validation-failed', status: 400, issues },
    },
  })

  it('answers a rejected source with the built-in variant on the first-party channel', async () => {
    const response = await fetch('/api/search?page=nope', {
      headers: firstParty,
    })

    expect(response.status).toBe(400)

    const body = await response.json()

    // The whole body, so an extra key fails too. The tag must never ride the
    // reason phrase.
    expect(body).toEqual(variantBody([BAD_PAGE]))
    expect(body.statusMessage).not.toBe('validation-failed')
  })

  it('strips the marker for a third party and leaves data.issues', async () => {
    const response = await fetch('/api/search?page=nope', {
      headers: thirdParty,
    })

    expect(response.status).toBe(400)

    const body = await response.json()

    expect(JSON.stringify(body)).not.toContain(KNOWN_ERROR_KEY)
    expect(body.data).toEqual({ issues: [BAD_PAGE] })
  })

  it('serves a `validate`-only route the parent’s context', async () => {
    expect(await $fetch('/api/search?page=3')).toEqual({ page: 3, hits: [] })
  })

  it('raises each half of a route declaring both', async () => {
    const rejected = await fetch(
      '/api/users',
      jsonPost(JSON.stringify({ name: '', email: 'nope' }), firstParty)
    )

    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toEqual(
      variantBody([
        { source: 'body', message: 'name is required', path: ['name'] },
        {
          source: 'body',
          message: 'email must be an address',
          path: ['email'],
        },
      ])
    )

    const declared = await fetch(
      '/api/users',
      jsonPost(
        JSON.stringify({ name: 'Ada', email: 'taken@example.com' }),
        firstParty
      )
    )

    expect(declared.status).toBe(409)
    expect(await declared.json()).toMatchObject({
      statusCode: 409,
      message: 'user-exists',
      data: {
        [KNOWN_ERROR_KEY]: {
          tag: 'user-exists',
          status: 409,
          email: 'taken@example.com',
        },
      },
    })

    expect(
      await $fetch(
        '/api/users',
        jsonPost(JSON.stringify({ name: 'Ada', email: 'ada@example.com' }))
      )
    ).toEqual({ created: 'Ada' })
  })

  it('lets malformed JSON reach an `errors`-only POST untouched', async () => {
    // No validation declared, so nothing reads the body before the handler.
    expect(await $fetch('/api/notes', jsonPost('{"name":'))).toEqual({
      reached: true,
      raw: '{"name":',
    })
  })

  it('answers malformed JSON on a validating POST with the body issue', async () => {
    const response = await fetch('/api/users', jsonPost('{"name":', firstParty))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(variantBody([UNPARSEABLE_BODY]))
  })

  it('puts the validation marker nowhere in a serialized response', async () => {
    const responses = await Promise.all([
      fetch('/api/search?page=nope', { headers: firstParty }),
      fetch('/api/search?page=nope', { headers: thirdParty }),
      fetch('/api/users', jsonPost('{"name":', firstParty)),
    ])

    for (const response of responses) {
      expect(await response.text()).not.toContain(VALIDATION_MARKER)
    }
  })

  // --- One smoke per parent, against the parent's own expectations --------

  it('carries a declared failure exactly as the errors parent does', async () => {
    const response = await fetch('/api/users/missing', { headers: firstParty })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      ...nitroExtras,
      error: true,
      url: expect.stringMatching(/\/api\/users\/missing$/),
      statusCode: 404,
      statusMessage: expect.any(String),
      message: 'user-not-found',
      data: {
        [KNOWN_ERROR_KEY]: {
          tag: 'user-not-found',
          status: 404,
          userId: 'missing',
        },
      },
    })

    // The third-party view: an ordinary error, marker gone, `data` with it.
    const stripped = await fetch('/api/users/missing', { headers: thirdParty })
    const body = await stripped.json()

    expect(stripped.status).toBe(404)
    expect(JSON.stringify(body)).not.toContain(KNOWN_ERROR_KEY)
    expect(body.data).toBeUndefined()

    expect(await $fetch('/api/users/42')).toEqual({ id: '42', name: 'User 42' })
  })

  it('rejects a request exactly as the validation parent does, but for the wire', async () => {
    // The parent's promise, minus its own failure shape: every issue in one
    // source arrives together, and the success path is untouched.
    const response = await fetch(
      '/api/users',
      jsonPost(JSON.stringify({ name: '', email: 'nope' }), thirdParty)
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      data: {
        issues: [
          { source: 'body', message: 'name is required', path: ['name'] },
          {
            source: 'body',
            message: 'email must be an address',
            path: ['email'],
          },
        ],
      },
    })
  })
}

/**
 * A POST carrying an already-serialized payload. Typed structurally rather
 * than as `RequestInit`, because it is handed to both `fetch` and ofetch's
 * `$fetch`.
 */
interface JsonPost {
  method: 'POST'
  headers: Record<string, string>
  body: string
}

/** The caller's headers land last. */
function jsonPost(
  body: string,
  headers: Record<string, string> = {}
): JsonPost {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  }
}
