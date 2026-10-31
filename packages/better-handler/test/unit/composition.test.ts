import { postJson, request } from '@dphonys/test-utils/h3-app'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../src/runtime/server'

// The composing wrapper with every half declared at once, driven through a
// real h3 app: the input validated before the Handler is entered, and both
// helpers in one context, each answering its own way. The halves alone are
// the errors and io suites'.

/** A body schema that settles a tick late and records when it did. */
function slowDraft(
  events: string[]
): StandardSchemaV1<{ total: number }, { total: number }> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        events.push('validated')

        const parsed = z.object({ total: z.number() }).safeParse(value)

        return parsed.success
          ? { value: parsed.data }
          : { issues: [{ message: 'total must be a number' }] }
      },
    },
  }
}

/** A route declaring input, a status map and errors, recording its order. */
function receiptRoute(events: string[]) {
  return defineBetterEventHandler(
    {
      input: {
        query: z.object({ mode: z.enum(['create', 'refuse']) }),
        body: slowDraft(events),
      },
      output: { 201: z.object({ total: z.number() }), 204: null },
      errors: { 'receipt-refused': { status: 409 } },
    },
    (_event, { query, body, respond, fail }) => {
      events.push('entered')

      if (query.mode === 'refuse') throw fail('receipt-refused')

      return respond(201, { total: body.total })
    }
  )
}

describe('a route declaring input, output and errors', () => {
  it('validates every source, an asynchronous one included, before the Handler is entered', async () => {
    const events: string[] = []

    const response = await request(
      receiptRoute(events),
      '/api/test?mode=create',
      { init: postJson('{"total":12}') }
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ total: 12 })
    expect(events).toEqual(['validated', 'entered'])
  })

  it('never enters the Handler for a rejected source', async () => {
    const events: string[] = []

    const response = await request(
      receiptRoute(events),
      '/api/test?mode=create',
      { init: postJson('{"total":"twelve"}') }
    )

    expect(response.status).toBe(400)
    expect((await response.json()).data._tag).toBe('validation-failed')
    expect(events).toEqual(['validated'])
  })

  it('hands the Handler the Fail helper beside the Respond helper', async () => {
    const events: string[] = []

    const refused = await request(
      receiptRoute(events),
      '/api/test?mode=refuse',
      { init: postJson('{"total":12}') }
    )

    expect(refused.status).toBe(409)
    expect((await refused.json()).data).toEqual({ _tag: 'receipt-refused' })
  })
})

describe('a route declaring errors and output but no input', () => {
  it('validates nothing, so a body no read could parse never stops it', async () => {
    const route = defineBetterEventHandler(
      {
        output: { 200: z.object({ served: z.literal(true) }) },
        errors: { 'receipt-refused': { status: 409 } },
      },
      (_event, { respond }) => respond(200, { served: true })
    )

    const response = await request(route, '/api/test', {
      init: postJson('{ not json at all'),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ served: true })
  })
})
