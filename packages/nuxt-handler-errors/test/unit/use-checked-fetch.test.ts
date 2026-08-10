import { beforeEach, describe, expect, it } from 'vitest'
import { ref, toValue } from 'vue'
import {
  useCheckedFetch,
  useLazyCheckedFetch,
} from '../../src/runtime/app/composables/use-checked-fetch'
import { calls } from '../doubles/nuxt-app'

/**
 * The header merge — the COMPOSABLE form — and the rest of what the wrapper
 * hands vanilla.
 *
 * The composable is app-side, so `vitest.config.ts` aliases `#app` to a double
 * that records the three arguments the wrapper passed on. That boundary is
 * exactly what the merge is a claim about; the composable *running*, against a
 * real built server, is the e2e tier.
 *
 * **Naive spreading is a shipped-defect-class bug, not a style issue**, and the
 * three input shapes below are why: a `Headers` instance has no own enumerable
 * properties and spreads to nothing, and a tuple array spreads to
 * `{"0": […], "1": […]}` and is corrupted outright. Both are legal, common
 * forms — the first is what `new Headers({ authorization: … })` produces.
 */

/** A stand-in for a caller's own `transform`, identified by reference. */
const transform = (value: unknown): unknown => value

/** The headers the wrapper handed vanilla, resolved and flattened as sent. */
function sentHeaders(): Record<string, string> {
  const last = calls.at(-1)

  if (last === undefined) throw new Error('nothing reached the vanilla double')

  return Object.fromEntries(
    new Headers(toValue(last.opts?.headers) as HeadersInit)
  )
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
    // Vanilla's option type is `ComputedOptions<HeadersInit>`: the whole value
    // may be a ref or a getter, and `useFetch` puts the options object into a
    // `reactive()` that `useAsyncData` watches — so a `headers: someRef`
    // re-fetches when the ref changes. Resolving eagerly in the merge would
    // freeze it at call time; this is what says the merge did not.
    //
    // It also covers the *inner* level of `ComputedOptions`: vanilla never has
    // to unwrap a per-value ref, because it hands the raw object to
    // `reactive()` and ofetch reads through that proxy. A merge reads the raw
    // object first, so without an unwrap `ref('first')` arrives as
    // `[object Object]`.
    const token = ref('first')

    useCheckedFetch('/anything', { headers: { authorization: token } })

    expect(sentHeaders().authorization).toBe('first')

    token.value = 'second'

    expect(sentHeaders().authorization).toBe('second')
  })

  it('resolves a getter for the whole headers value', () => {
    // The other half of `ComputedOptions<HeadersInit>`: the value itself may be
    // a getter rather than a ref, which reaches `toValue` on a different path.
    useCheckedFetch('/anything', { headers: () => ({ 'x-trace': '7' }) })

    expect(sentHeaders()['x-trace']).toBe('7')
  })

  it('adds accept when the caller passed no headers at all', () => {
    useCheckedFetch('/anything')

    expect(sentHeaders()).toEqual({ accept: 'application/json' })
  })

  it('hands vanilla a plain object, never a Headers instance', () => {
    // The half `sentHeaders` above is blind to, because it re-wraps whatever it
    // is given in a `Headers` and so normalises the distinction away.
    //
    // `useFetch` swaps in `useRequestFetch()` — h3's `fetchWithEvent` — for
    // every same-origin SSR request, and that merges headers by **object
    // spread**. A `Headers` instance has no own enumerable properties, so
    // handing one on discards the caller's headers *and* this module's
    // `accept`.
    useCheckedFetch('/anything', {
      headers: new Headers({ authorization: 'Bearer t' }),
    })

    const sent = toValue(calls.at(-1)?.opts?.headers)

    expect(sent).not.toBeInstanceOf(Headers)
    expect({ ...(sent as object) }).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })
})

describe('what else reaches vanilla', () => {
  it('forwards every other option verbatim', () => {
    // True by construction rather than by enumeration: `opts` is spread, so
    // anything a future Nuxt adds passes through with no change here.
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
    expect(typeof opts?.default).toBe('function')
  })

  it('splits vanilla’s (request, arg1, arg2) exactly as vanilla does', () => {
    // Overload 5's call shape. The key is forwarded in vanilla's own third
    // position — and because three arguments are *always* passed on, Nuxt's
    // key-injection transform never appends a fourth to the wrapper's own call
    // and collapses every call site onto one key.
    useCheckedFetch('/anything', 'my-key')

    expect(calls.at(-1)?.autoKey).toBe('my-key')
    expect(sentHeaders()).toEqual({ accept: 'application/json' })

    useCheckedFetch('/anything', { immediate: false }, 'other-key')

    expect(calls.at(-1)?.autoKey).toBe('other-key')
    expect(calls.at(-1)?.opts).toMatchObject({ immediate: false })
  })

  it('gives the lazy sibling Nuxt’s own lazy composable', () => {
    // The lazy option is supplied at run time exactly as vanilla does it — by
    // being Nuxt's `useLazyFetch` rather than by this module setting
    // `lazy: true`, which would also lose Nuxt's own dev-mode data diagnostics
    // tag.
    useCheckedFetch('/anything')
    useLazyCheckedFetch('/anything')

    expect(calls.map((call) => call.name)).toEqual(['useFetch', 'useLazyFetch'])
  })
})
