import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineValidation,
  defineValidatedEventHandler,
} from '../../src/runtime/server'
import { request } from '../h3-app'

/**
 * The two mistakes the wrapper refuses at **declaration time** - when the route
 * file is evaluated, before any request is served.
 *
 * Both are compile errors first. These are the callers the types never see: a
 * plain-JS route, a value that arrived as `any`, a group widened past the point
 * where the guard could read it. The declarations here are deliberately typed
 * loosely for that reason, which is also why the assertions are about the
 * throw and never about a diagnostic.
 */

const pagination = defineValidation('pagination', {
  query: z.object({ page: z.coerce.number() }),
})

describe('two sets sharing a name on one source', () => {
  const impostor = defineValidation('pagination', {
    query: z.object({ cursor: z.string() }),
  })

  it('throws when the handler is declared, naming the name, the source and the fix', () => {
    // One act, one throw. It refuses rather than dropping one, because the
    // sibling's silent first-wins dedupe is right there and wrong here:
    // dropping a duplicate-tagged error definition loses a declaration,
    // whereas dropping a same-named set loses validation that was declared
    // and would have run.
    expect(() =>
      defineValidatedEventHandler([...pagination, ...impostor], () => 'ok')
    ).toThrow(/named "pagination".*declare query.*Rename one of the sets/s)
  })

  it('leaves one set spread twice alone - nothing would be dropped', async () => {
    const common = [...pagination]

    // `[...common, ...pagination]` puts the name on the source twice, but it is
    // the SAME set: the same schema runs and produces the same value either
    // way, so nothing is lost. The compiler collapses the identical fragments
    // and poisons nothing, and the runtime must agree - throwing here would
    // manufacture a shape that compiles clean and then fails at startup, the
    // one hazard the design explicitly refused.
    const handler = defineValidatedEventHandler(
      [...common, ...pagination],
      (event, { query }) => query.pagination
    )

    const response = await request(handler, '/api/test?page=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: 2 })
  })

  it('leaves one name per source alone, however many sources share it', async () => {
    const auth = defineValidation('auth', {
      query: z.object({ token: z.string() }),
      headers: z.object({ authorization: z.string() }),
    })

    // One name on two sources is not a collision: each source has its own
    // namespace, so nothing is ambiguous.
    const handler = defineValidatedEventHandler(
      [...auth, ...pagination],
      (event, { query, headers }) => ({
        token: query.auth.token,
        page: query.pagination.page,
        authorization: headers.auth.authorization,
      })
    )

    const response = await request(handler, '/api/test?token=t&page=2', {
      init: { headers: { authorization: 'Bearer x' } },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      token: 't',
      page: 2,
      authorization: 'Bearer x',
    })
  })
})

describe('groups combined with object spread', () => {
  const sorting = defineValidation('sorting', {
    query: z.object({ sort: z.enum(['asc', 'desc']) }),
  })

  // Typed as the wrapper's own parameter, which is what a JS caller effectively
  // hands it. Object spread keeps only the last fragment (`{ 0: sorting }`),
  // so every earlier set would silently never run.
  const objectSpread = { ...pagination, ...sorting } as Parameters<
    typeof defineValidatedEventHandler
  >[0]

  it('throws when the handler is declared, naming the fix rather than the symptom', () => {
    expect(() => defineValidatedEventHandler(objectSpread, () => 'ok')).toThrow(
      /nuxt-handler-validation.*\[\.\.\.pagination, \.\.\.sorting\]/s
    )
  })

  it('does not blame object spread for a value that is not a declaration', () => {
    // A stray `null` from a JS caller still fails - it is not a schema set and
    // this package has no rule that makes it one. What it must not do is claim
    // the author object-spread a group: a guard that misnames the problem is
    // worse than one that stays quiet.
    expect(() =>
      defineValidatedEventHandler(
        null as unknown as Parameters<typeof defineValidatedEventHandler>[0],
        () => 'ok'
      )
    ).not.toThrow(/array spread/)
  })

  it('leaves an ordinary flat declaration alone', async () => {
    const handler = defineValidatedEventHandler(
      { query: z.object({ page: z.coerce.number() }) },
      (event, { query }) => ({ page: query.page })
    )

    const response = await request(handler, '/api/test?page=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: 2 })
  })
})
