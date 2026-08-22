import { createError, defineEventHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { SourcePlan } from '../../src/runtime/internals/server'
import {
  sourcePlan,
  validatedContext,
} from '../../src/runtime/internals/server'
import { readValidationMarker } from '../../src/runtime/internals/shared'
import type { ValidationSchemas } from '../../src/runtime/types'
import { postJson, request, schemaReturning } from '../h3-app'

// The seam the umbrella calls: `sourcePlan` once, `validatedContext` per
// request, driven through a real h3 app so the body read is h3's own.

describe('validatedContext with no options', () => {
  it('throws the marked 400 the package answers with on its own', async () => {
    const plan = sourcePlan({ query: z.object({ page: z.coerce.number() }) })
    let thrown: unknown

    const response = await request(
      defineEventHandler((event) => validatedContext(event, plan)),
      '/api/test?page=nope',
      {
        onError: (error) => {
          thrown = error
        },
      }
    )

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    expect(thrown).toMatchObject({
      statusCode: 400,
      statusMessage: 'Validation Error',
      message: 'Validation failed for query',
      data: {
        issues: [
          { source: 'query', message: expect.any(String), path: ['page'] },
        ],
      },
    })
    expect(readValidationMarker(thrown)).toBeDefined()
  })
})

describe('validatedContext with an onInvalid hook', () => {
  it('hands the hook the projected issues of one source, once, and throws what it throws', async () => {
    const calls: Array<[string, unknown]> = []
    // An H3Error, so h3 passes it through by identity rather than wrapping it.
    const own = createError({ statusCode: 422, statusMessage: 'Custom' })
    let thrown: unknown

    // A vendor-shaped issue: only `message` and a normalized `path` may reach
    // the hook; `input` and `expected` must not.
    const vendorIssue = {
      message: 'Expected a number',
      path: [{ key: 'page' }],
      input: { password: 'hunter2' },
      expected: 'number',
    }

    const plan = sourcePlan({
      query: schemaReturning({ issues: [vendorIssue] }),
      body: z.object({ name: z.string() }),
    })

    const response = await request(
      defineEventHandler((event) =>
        validatedContext(event, plan, {
          onInvalid: (source, issues) => {
            calls.push([source, issues])
            throw own
          },
        })
      ),
      '/api/test',
      {
        init: postJson('{ not json at all'),
        onError: (error) => {
          thrown = error
        },
      }
    )

    // One call, for the first failing source - the unparseable body after it
    // was never read, or the hook would have seen a `body` issue too.
    expect(calls).toEqual([
      [
        'query',
        [{ source: 'query', message: 'Expected a number', path: ['page'] }],
      ],
    ])
    expect(thrown).toBe(own)
    expect(response.status).toBe(422)
  })

  it('routes an unparseable body through the same hook as one body issue', async () => {
    const calls: Array<[string, unknown]> = []
    const own = createError({ statusCode: 422, statusMessage: 'Custom' })
    const plan = sourcePlan({ body: z.object({ name: z.string() }) })

    const response = await request(
      defineEventHandler((event) =>
        validatedContext(event, plan, {
          onInvalid: (source, issues) => {
            calls.push([source, issues])
            throw own
          },
        })
      ),
      '/api/test',
      { init: postJson('{ not json at all') }
    )

    expect(response.status).toBe(422)
    expect(calls).toEqual([
      [
        'body',
        [
          {
            source: 'body',
            message: 'Request body could not be parsed',
            path: [],
          },
        ],
      ],
    ])
  })
})

/** Mounts the plan with a hook that records any call, and reports what h3 saw. */
async function faultOf(
  plan: readonly SourcePlan[]
): Promise<{ status: number; calls: number; thrown: unknown }> {
  let calls = 0
  let thrown: unknown

  const response = await request(
    defineEventHandler((event) =>
      validatedContext(event, plan, {
        onInvalid: () => {
          calls += 1
          throw new Error('the hook must not be reached')
        },
      })
    ),
    '/api/test',
    {
      onError: (error) => {
        thrown = error
      },
    }
  )

  return { status: response.status, calls, thrown }
}

describe('the faults validatedContext raises on its own', () => {
  it('answer 500 past the hook, unmarked, for a failure reporting no issues', async () => {
    const fault = await faultOf(
      sourcePlan({ query: schemaReturning({ issues: [] }) })
    )

    expect(fault.status).toBe(500)
    expect(fault.calls).toBe(0)
    expect(readValidationMarker(fault.thrown)).toBeUndefined()
  })

  it('answer 500 past the hook, unmarked, for an unmergeable output', async () => {
    const fault = await faultOf(
      sourcePlan({
        query: [
          schemaReturning({ value: { a: 1 } }),
          schemaReturning({ value: 'not an object' }),
        ],
      })
    )

    expect(fault.status).toBe(500)
    expect(fault.calls).toBe(0)
    expect(readValidationMarker(fault.thrown)).toBeUndefined()
  })
})

describe('sourcePlan', () => {
  it('refuses a non-schema at route evaluation with a plain, unmarked Error', () => {
    let thrown: unknown

    try {
      sourcePlan({ query: 'not a schema' } as unknown as ValidationSchemas)
    } catch (error) {
      thrown = error
    }

    // No request exists yet, so no hook can be consulted: the throw happens
    // before `validatedContext` is ever called.
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toHaveProperty('statusCode')
    expect(readValidationMarker(thrown)).toBeUndefined()
  })
})
