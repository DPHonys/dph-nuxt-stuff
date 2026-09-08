import { postJson } from '@dphonys/test-utils/h3-app'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect, it } from 'vitest'
import { VALIDATION_ERROR_KEY } from '../../src/runtime/shared/error-marker'
import type { ValidationIssue } from '../../src/runtime/types'

/**
 * The whole wire contract, in one copy, run by `wire.test.ts` against a
 * production build and `wire-dev.test.ts` against a dev server. "Identical in
 * development and production" is asserted by there being exactly one copy.
 *
 * Every message pinned below is the playground's own custom one, so these
 * assertions are that app's contract rather than a schema library's wording.
 */

/**
 * The marker's key as it would read if it ever reached a client, derived rather
 * than restated so a rename cannot leave this passing against the old one. A
 * missing description degrades to the empty string, which every
 * `not.toContain` below fails on.
 */
const MARKER_KEY = VALIDATION_ERROR_KEY.description ?? ''

/** What `/api/search?page=nope` and the composed `/api/reports` produce. */
const BAD_PAGE: ValidationIssue = {
  source: 'query',
  message: 'page must be a whole number',
  path: ['page'],
}

/** What `/api/orders/nope` produces - the first source in the fail-fast order. */
const BAD_ORDER_ID: ValidationIssue = {
  source: 'route',
  message: 'order id must be a whole number',
  path: ['id'],
}

/** This package's own wording for a body the request made unreadable. */
const UNPARSEABLE_BODY: ValidationIssue = {
  source: 'body',
  message: 'Request body could not be parsed',
  path: [],
}

/** Keys Nitro adds to an error body that this package does not own. */
export interface NitroExtras {
  /** The dev server's stack frames; a production build sends none. */
  stack?: readonly string[]
}

/** Nitro's error envelope around this package's one fixed payload. */
interface FailureEnvelope extends NitroExtras {
  error: true
  url: string
  statusCode: 400
  statusMessage: 'Validation Error'
  message: string
  data: { issues: readonly ValidationIssue[] }
}

export function theValidationWire(nitroExtras: NitroExtras): void {
  const failureBody = (
    issues: readonly ValidationIssue[]
  ): FailureEnvelope => ({
    ...nitroExtras,
    error: true,
    url: expect.any(String),
    statusCode: 400,
    statusMessage: 'Validation Error',
    // A human summary only - nothing may parse it, so nothing here pins it.
    message: expect.any(String),
    data: { issues },
  })

  it('answers a bad query with the one fixed shape, whole', async () => {
    const response = await fetch('/api/search?page=nope')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(failureBody([BAD_PAGE]))
  })

  it('answers a bad route param under the source name `route`', async () => {
    const response = await fetch('/api/orders/nope')

    expect(response.status).toBe(400)

    const body = await response.json()

    expect(body).toEqual(failureBody([BAD_ORDER_ID]))

    // The one assertion on the human summary anywhere: nothing may parse it,
    // but it names the source, so a half-landed rename shows up here.
    expect(body.message).toBe('Validation failed for route')
  })

  it('hands the validated route params over as `route`', async () => {
    expect(await $fetch('/api/orders/42')).toEqual({ id: 42 })
  })

  it('answers a bad body with every issue that source had', async () => {
    const response = await fetch(
      '/api/users',
      postJson(JSON.stringify({ name: '', age: 12 }))
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      failureBody([
        { source: 'body', message: 'name is required', path: ['name'] },
        { source: 'body', message: 'age must be at least 18', path: ['age'] },
      ])
    )
  })

  it('answers a malformed JSON body in that same shape', async () => {
    const response = await fetch('/api/users', postJson('{"name":'))

    // The wording is the package's own, content-type-agnostic one, not h3's.
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(failureBody([UNPARSEABLE_BODY]))
  })

  it('keeps a method-agnostic route that declares a body working', async () => {
    // A `GET` cannot carry a body, so the read is skipped and the body source
    // validates `undefined` - h3's bare `405` never escapes.
    expect(await $fetch('/api/profile')).toEqual({
      method: 'GET',
      nickname: null,
    })

    // The same route and the same declaration, reached with a method that can.
    expect(
      await $fetch(
        '/api/profile',
        postJson(JSON.stringify({ nickname: 'dph' }))
      )
    ).toEqual({ method: 'POST', nickname: 'dph' })
  })

  it('delivers a composed tuple’s outputs as one flat value', async () => {
    // Three schemas from two libraries compose `query`, all three against the
    // same raw source.
    expect(await $fetch('/api/reports?page=2&sort=desc&report=weekly')).toEqual(
      { report: 'weekly', page: 2, sort: 'desc' }
    )
  })

  it('never names the composed element that rejected in an issue’s path', async () => {
    const response = await fetch('/api/reports?page=nope&sort=desc&report=w')

    // A tuple is a composition detail, not a namespace: the path is the one
    // the client's own query string has.
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(failureBody([BAD_PAGE]))
  })

  it('answers a developer mistake of ours as a plain 500, whole', async () => {
    const response = await fetch('/api/unmergeable?q=hi')

    // No issues payload at all, so a client cannot mistake this package's bug
    // for its own bad input any more than an observability hook can.
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ...nitroExtras,
      error: true,
      url: expect.any(String),
      statusCode: 500,
      statusMessage: 'Server Error',
      message: expect.stringContaining('cannot merge the validated query'),
    })
  })

  it('puts no marker anywhere in a serialized response', async () => {
    // Under any key, at any depth: read as text, so this cannot be fooled by a
    // key a whole-body assertion happens not to name.
    const responses = await Promise.all([
      fetch('/api/search?page=nope'),
      fetch('/api/users', postJson('{"name":')),
      fetch('/api/reports?page=nope&sort=desc&report=w'),
      // The developer-error path, which carries no marker to begin with, and
      // the success path, which is nobody's failure at all.
      fetch('/api/unmergeable?q=hi'),
      fetch('/api/search?page=3'),
    ])

    for (const response of responses) {
      expect(await response.text()).not.toContain(MARKER_KEY)
    }
  })

  it('recognizes a validation failure at the error hook, and no bug of ours', async () => {
    await fetch('/api/search?page=nope')
    await fetch('/api/unmergeable?q=hi')

    const observed = await $fetch<ObservedError[]>('/api/observed')

    // A client's bad input: recognized, with its issues, so a hook may skip it.
    expect(observed).toContainEqual({
      statusCode: 400,
      message: expect.any(String),
      recognized: true,
      issues: [BAD_PAGE],
    })

    // This package's own developer error - the unmergeable merge - is not
    // recognized, so a hook that skips validation failures still reports it.
    expect(observed).toContainEqual({
      statusCode: 500,
      message: expect.stringContaining('cannot merge the validated query'),
      recognized: false,
      issues: null,
    })
  })

  it('surfaces a fetched failure’s issues at err.data.data.issues', async () => {
    // `recognized: false` is the other half of the marker promise: a failure
    // that crossed a wire is not a locally raised one.
    expect(await $fetch('/api/fetched-failure')).toEqual({
      rejected: true,
      atDataIssues: null,
      atDataDataIssues: [BAD_PAGE],
      recognized: false,
    })
  })
}

/**
 * What `/api/observed` reports, as it arrives over the wire - restated rather
 * than imported, so nothing here leans on the fixture's own types.
 */
interface ObservedError {
  statusCode: number | undefined
  message: string
  recognized: boolean
  issues: ValidationIssue[] | null
}
