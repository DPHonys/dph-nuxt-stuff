import { beforeEach, describe, expect, it } from 'vitest'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import type {
  RawFetch,
  RawOptions,
} from '../../src/runtime/shared/checked-fetch-factory'
import { createCheckedFetch } from '../../src/runtime/shared/checked-fetch-factory'

// The factory with the channel token handed in as a value - the seam a module
// layer composes its own global from. `checked-fetch.test.ts` covers the same
// behaviour through the parent's alias binding; this file proves the token
// needs no alias at all.

/** The headers the last call put on the wire, once ofetch's defaults merge. */
let sent: Headers = new Headers()

/**
 * A stand-in for vanilla's namespace. `create` is ofetch's own shallow
 * spread: a `headers` key replaces the instance's wholesale.
 */
function fakeFetch(defaults: RawOptions = {}): RawFetch {
  const record = (opts?: RawOptions): Promise<unknown> => {
    sent = new Headers(defaults.headers)
    for (const [name, value] of new Headers(opts?.headers)) {
      sent.set(name, value)
    }
    return Promise.resolve('ok')
  }

  return Object.assign((_request: unknown, opts?: RawOptions) => record(opts), {
    raw: (_request: unknown, opts?: RawOptions) => record(opts),
    create: (next: RawOptions) => fakeFetch({ ...defaults, ...next }),
    native: globalThis.fetch,
  })
}

describe('createCheckedFetch with the token as a value', () => {
  beforeEach(() => {
    sent = new Headers()
  })

  it('attaches no channel header for an undefined token', async () => {
    await createCheckedFetch(fakeFetch(), { token: undefined })('/anything')

    expect(Object.fromEntries(sent)).toEqual({ accept: 'application/json' })
  })

  it('attaches the channel header for a string token', async () => {
    await createCheckedFetch(fakeFetch(), { token: 't' })('/anything')

    expect(Object.fromEntries(sent)).toEqual({
      accept: 'application/json',
      [CHANNEL_HEADER]: 't',
    })
  })

  it('threads the instance headers through create(defaults)', async () => {
    const instance = createCheckedFetch(fakeFetch(), { token: 't' }).create({
      headers: { accept: 'text/html' },
    })

    await instance('/anything')

    // The instance's own `accept` wins - the factory sees it through the
    // threaded instance headers and does not overwrite it with JSON.
    expect(Object.fromEntries(sent)).toEqual({
      accept: 'text/html',
      [CHANNEL_HEADER]: 't',
    })
  })

  it('re-reads a getter-backed token on every call, through create() too', async () => {
    // The contract a module layer's binding relies on: `token` is read at
    // call time, so a live alias binding shows through without a rebuild.
    let live: string | undefined
    const checked = createCheckedFetch(fakeFetch(), {
      get token() {
        return live
      },
    })
    const instance = checked.create({ headers: { authorization: 'Bearer t' } })

    live = 'later'
    await instance('/anything')

    expect(sent.get(CHANNEL_HEADER)).toBe('later')
  })
})
