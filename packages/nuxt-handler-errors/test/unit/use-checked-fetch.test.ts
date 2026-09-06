import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref, toValue } from 'vue'
import { z } from 'zod'
import {
  useCheckedFetch,
  useLazyCheckedFetch,
} from '../../src/runtime/app/composables/use-checked-fetch'
import { CHANNEL_HEADER } from '../../src/runtime/shared/channel'
import { setConfiguredChannelToken } from '../doubles/channel-token'
import { calls } from '../doubles/nuxt-app'

// The header merge, composable form. The `#app` double records the three
// arguments the wrapper passed on; the composable *running* against a real
// server is the e2e tier. Naive spreading of headers is a real defect class: a
// `Headers` instance spreads to nothing and a tuple array is corrupted to
// `{"0": …}`.

/** A stand-in for a caller's own `transform`, identified by reference. */
const transform = <T>(value: T): T => value

// What the wrapper hands vanilla is read back as the flat record it claims
// to be - a `Headers` instance or a tuple array would fail this parse.
const flatHeaders = z.record(z.string(), z.string())

/** The headers the wrapper handed vanilla, resolved and flattened as sent. */
function sentHeaders(): Record<string, string> {
  const last = calls.at(-1)

  if (last === undefined) throw new Error('nothing reached the vanilla double')

  return flatHeaders.parse(toValue(last.opts?.headers))
}

beforeEach(() => {
  calls.length = 0
})

describe('the header merge', () => {
  it('keeps a plain object and adds accept', () => {
    useCheckedFetch('/anything', { headers: { authorization: 'Bearer t' } })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('keeps a Headers instance, which a spread would drop whole', () => {
    useCheckedFetch('/anything', {
      headers: new Headers({ authorization: 'Bearer t' }),
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('keeps a tuple array, which a spread would corrupt outright', () => {
    useCheckedFetch('/anything', {
      headers: [
        ['authorization', 'Bearer t'],
        ['x-trace', '7'],
      ],
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      'x-trace': '7',
      accept: 'application/json',
    })
  })

  it('honours a caller’s own accept, in every input shape', () => {
    useCheckedFetch('/anything', { headers: { accept: 'text/html' } })
    expect(sentHeaders().accept).toBe('text/html')

    useCheckedFetch('/anything', {
      headers: new Headers({ Accept: 'text/csv' }),
    })
    expect(sentHeaders().accept).toBe('text/csv')

    useCheckedFetch('/anything', { headers: [['ACCEPT', 'text/plain']] })
    expect(sentHeaders().accept).toBe('text/plain')
  })

  it('resolves a ref lazily, so a watched header stays watched', () => {
    // `useFetch` puts the options into a `reactive()` that re-fetches when a
    // ref changes; resolving eagerly in the merge would freeze it at call time.
    // The merge also has to unwrap per-value refs itself - it reads the raw
    // object, unlike vanilla, which hands it to `reactive()` whole.
    const token = ref('first')

    useCheckedFetch('/anything', { headers: { authorization: token } })

    expect(sentHeaders().authorization).toBe('first')

    token.value = 'second'

    expect(sentHeaders().authorization).toBe('second')
  })

  it('resolves a getter for the whole headers value', () => {
    useCheckedFetch('/anything', { headers: () => ({ 'x-trace': '7' }) })

    expect(sentHeaders()['x-trace']).toBe('7')
  })

  it('adds accept when the caller passed no headers at all', () => {
    useCheckedFetch('/anything')

    expect(sentHeaders()).toEqual({ accept: 'application/json' })
  })

  it('hands vanilla a plain object, never a Headers instance', () => {
    // On same-origin SSR requests `useFetch` swaps in h3's `fetchWithEvent`,
    // which merges headers by object spread - a `Headers` instance has no own
    // enumerable properties, so handing one on discards everything.
    useCheckedFetch('/anything', {
      headers: new Headers({ authorization: 'Bearer t' }),
    })

    const sent = toValue(calls.at(-1)?.opts?.headers)

    expect(sent).not.toBeInstanceOf(Headers)
    expect(flatHeaders.parse(sent)).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })
})

describe('what else reaches vanilla', () => {
  it('forwards every other option verbatim', () => {
    // True by construction: `opts` is spread, so anything a future Nuxt adds
    // passes through.
    const watch = ref(0)

    useCheckedFetch('/anything', {
      transform,
      pick: [],
      default: () => null,
      lazy: true,
      watch: [watch],
      immediate: false,
    })

    const opts = calls.at(-1)?.opts

    expect(opts).toMatchObject({
      transform,
      pick: [],
      lazy: true,
      watch: [watch],
      immediate: false,
    })
    expect(opts?.default).toBeTypeOf('function')
  })

  it('splits vanilla’s (request, arg1, arg2) exactly as vanilla does', () => {
    // Three arguments are always passed on, so Nuxt's key-injection transform
    // never appends a fourth and collapses every call site onto one key.
    useCheckedFetch('/anything', 'my-key')

    expect(calls.at(-1)?.autoKey).toBe('my-key')
    expect(sentHeaders()).toEqual({ accept: 'application/json' })

    useCheckedFetch('/anything', { immediate: false }, 'other-key')

    expect(calls.at(-1)?.autoKey).toBe('other-key')
    expect(calls.at(-1)?.opts).toMatchObject({ immediate: false })
  })

  it('gives the lazy sibling Nuxt’s own lazy composable', () => {
    // Being `useLazyFetch` rather than setting `lazy: true` keeps Nuxt's own
    // dev-mode data diagnostics tag.
    useCheckedFetch('/anything')
    useLazyCheckedFetch('/anything')

    expect(calls.map((call) => call.name)).toEqual(['useFetch', 'useLazyFetch'])
  })
})

describe('the channel tag - the COMPOSABLE form', () => {
  // The token is module state via the double, so every test clears it.
  afterEach(() => {
    setConfiguredChannelToken(undefined)
  })

  it('attaches nothing when no token is configured', () => {
    useCheckedFetch('/anything')

    expect(sentHeaders()).toEqual({ accept: 'application/json' })
  })

  it('attaches the token beside accept once one is configured', () => {
    setConfiguredChannelToken('first-party')

    useCheckedFetch('/anything', { headers: { authorization: 'Bearer t' } })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
      [CHANNEL_HEADER]: 'first-party',
    })
  })

  it('overrides a caller’s own value for the header', () => {
    setConfiguredChannelToken('first-party')

    useCheckedFetch('/anything', { headers: { [CHANNEL_HEADER]: 'forged' } })

    expect(sentHeaders()[CHANNEL_HEADER]).toBe('first-party')
  })

  it('attaches it on the lazy twin too', () => {
    setConfiguredChannelToken('first-party')

    useLazyCheckedFetch('/anything')

    expect(sentHeaders()[CHANNEL_HEADER]).toBe('first-party')
  })
})
