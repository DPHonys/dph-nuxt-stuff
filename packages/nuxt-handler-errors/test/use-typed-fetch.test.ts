import { beforeEach, describe, expect, it } from 'vitest'
import { ref, toValue } from 'vue'
import {
  useLazyTypedFetch,
  useTypedFetch,
} from '../src/runtime/app/composables/use-typed-fetch'
import { calls } from './doubles/nuxt-app'

/**
 * The header merge, and the rest of what the wrapper hands vanilla.
 *
 * The composable itself is app-side — it imports `useFetch` from `#app` — so
 * `vitest.config.ts` aliases that one specifier to `./doubles/nuxt-app`, which
 * records the three arguments the wrapper passed on. That boundary is exactly
 * what the merge is a claim about; the composable *running*, against a real
 * built server, is `test/specifiers.test.ts`.
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
    useTypedFetch('/anything', { headers: { authorization: 'Bearer t' } })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('keeps a Headers instance, which a spread would drop whole', () => {
    useTypedFetch('/anything', {
      headers: new Headers({ authorization: 'Bearer t' }),
    })

    expect(sentHeaders()).toEqual({
      authorization: 'Bearer t',
      accept: 'application/json',
    })
  })

  it('keeps a tuple array, which a spread would corrupt outright', () => {
    useTypedFetch('/anything', {
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
    // Overriding it forfeits the declared error channel for routes outside
    // `/api/**`, which is a documentation note (ticket 15) rather than
    // something to prevent — the caller asked.
    useTypedFetch('/anything', { headers: { accept: 'text/html' } })
    expect(sentHeaders().accept).toBe('text/html')

    useTypedFetch('/anything', { headers: new Headers({ Accept: 'text/csv' }) })
    expect(sentHeaders().accept).toBe('text/csv')

    useTypedFetch('/anything', { headers: [['ACCEPT', 'text/plain']] })
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

    useTypedFetch('/anything', { headers: { authorization: token } })

    expect(sentHeaders().authorization).toBe('first')

    token.value = 'second'

    expect(sentHeaders().authorization).toBe('second')
  })

  it('resolves a getter for the whole headers value', () => {
    // The other half of `ComputedOptions<HeadersInit>`: the value itself may be
    // a getter rather than a ref, which reaches `toValue` on a different path.
    useTypedFetch('/anything', { headers: () => ({ 'x-trace': '7' }) })

    expect(sentHeaders()['x-trace']).toBe('7')
  })

  it('adds accept when the caller passed no headers at all', () => {
    useTypedFetch('/anything')

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
    // `accept`. The flattening was originally scoped to the event-bound
    // wrapper only; measured, this surface needs it too, and
    // `test/specifiers.test.ts` is where the consequence is run.
    useTypedFetch('/anything', {
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
    // Every vanilla option carries over, and it is true by
    // construction rather than by enumeration — `opts` is spread, so anything
    // a future Nuxt adds passes through with no change here.
    const watch = ref(0)

    useTypedFetch('/anything', {
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
    useTypedFetch('/anything', 'my-key')

    expect(calls.at(-1)?.autoKey).toBe('my-key')
    expect(sentHeaders()).toEqual({ accept: 'application/json' })

    useTypedFetch('/anything', { immediate: false }, 'other-key')

    expect(calls.at(-1)?.autoKey).toBe('other-key')
    expect(calls.at(-1)?.opts).toMatchObject({ immediate: false })
  })

  it('gives the lazy sibling Nuxt’s own lazy composable', () => {
    // The lazy option is supplied at run time, exactly as vanilla
    // does it — by being Nuxt's `useLazyFetch` rather than by this module
    // setting `lazy: true`, which would also lose Nuxt's own dev-mode data
    // diagnostics tag.
    useTypedFetch('/anything')
    useLazyTypedFetch('/anything')

    expect(calls.map((call) => call.name)).toEqual(['useFetch', 'useLazyFetch'])
  })
})
