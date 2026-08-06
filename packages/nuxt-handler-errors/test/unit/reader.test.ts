import type { H3Error, H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import {
  DECLARED_ERROR_KEY,
  declaredError,
  defineErrors,
  defineTypedEventHandler,
  payload,
  useDeclaredError,
} from '../../src/runtime/shared'

/**
 * The reader's runtime guard.
 *
 * **This is a security-shaped surface.** `declaredError` decides whether an
 * arbitrary value — a response body a proxy may have rewritten, a `catch`
 * binding of unknown provenance, a hand-rolled imitation — is treated as a
 * declared variant and narrowed on its `tag`. So the assertions that matter
 * here are the **rejections**: a marker that is present but whose two-field
 * floor is unmet must read as *undeclared*, never as a malformed
 * declared failure, and that is the conservative direction because an
 * undeclared error is what every consumer already knows how to handle.
 *
 * The type-level half is `test/types/pos/reader.ts`; the wire crossing is
 * `test/e2e/wire.test.ts`. Nothing here re-proves either.
 */

const userErrors = defineErrors({
  'user-not-found': {
    status: 404,
    payload: payload<{ userId: string }>(),
  },
})

/**
 * A client-side error value, built from a variant the module **really
 * raised** — through `fail`, which is the one raise path that ships.
 *
 * Deliberately not a hand-written envelope: the marker comes out of a typed
 * handler's own `fail`, and the two hops around it are Nitro's production
 * serializer (`prod.mjs:54-60`) reproduced field for field. An expectation that
 * restated the envelope would agree with a reader that had stopped reading it.
 */
function clientErrorFor(userId: string): unknown {
  const handler = defineTypedEventHandler(
    { errors: [userErrors] },
    (_event, { fail }) => fail('user-not-found', { userId })
  )

  let thrown: unknown

  try {
    // `fail` needs nothing off the event, so an empty object suffices.
    handler({} as H3Event)
  } catch (error) {
    thrown = error
  }

  const error = thrown as H3Error

  // ofetch defines `FetchError.data` as a getter over the whole response body,
  // and `createError` copies `input.data` wholesale — so the body sits one hop
  // in and the H3Error's own `data` one hop further.
  return {
    data: {
      error: true,
      url: '/api/users/42',
      statusCode: error.statusCode,
      statusMessage: error.statusMessage,
      message: error.message,
      data: error.data,
    },
  }
}

/** Wrap a marker value at the address the reader reads, whatever it is. */
function atTheMarkerAddress(marker: unknown): unknown {
  return { data: { data: { [DECLARED_ERROR_KEY]: marker } } }
}

describe('reading a declared variant out of an error value', () => {
  it('returns the variant the raise site produced, unchanged', () => {
    const error = clientErrorFor('42')

    expect(declaredError(error)).toEqual({
      tag: 'user-not-found',
      status: 404,
      userId: '42',
    })
  })

  it('hands back the marker itself rather than a copy of it', () => {
    // The reader is a *path*, not a transform: the marker's value **is** the
    // variant, byte for byte, with no excess key to `Omit` and
    // nothing to reassemble.
    const marker = { tag: 'forbidden', status: 403, requiredRole: 'owner' }

    expect(declaredError(atTheMarkerAddress(marker))).toBe(marker)
  })
})

describe('the shape floor, on a marker that is present', () => {
  /**
   * Each row is a marker that really is at the reserved key and really is
   * malformed — a proxy rewriting bodies, a mangled response, a hand-rolled
   * imitation. Every one of them must read as **undeclared**.
   */
  const malformed: readonly (readonly [string, unknown])[] = [
    ['no status at all', { tag: 'forbidden' }],
    ['a status that is a string', { tag: 'forbidden', status: '403' }],
    ['a status that is null', { tag: 'forbidden', status: null }],
    ['no tag at all', { status: 403 }],
    ['a tag that is a number', { tag: 403, status: 403 }],
    ['a tag that is null', { tag: null, status: 403 }],
    ['a marker that is null', null],
    ['a marker that is a string', 'forbidden'],
    ['a marker that is a number', 403],
    ['a marker that is an array', ['forbidden', 403]],
    ['an empty object', {}],
    [
      // `typeof` rather than `in` is what rejects this: a function carrying the
      // two reserved names satisfies every `in` check and is not a variant.
      'a function wearing the two reserved names',
      Object.assign(() => 'boom', { tag: 'forbidden', status: 403 }),
    ],
  ]

  it.each(malformed)('reads %s as undeclared', (_label, marker) => {
    expect(declaredError(atTheMarkerAddress(marker))).toBeUndefined()
  })

  it('accepts the floor with nothing else on it', () => {
    // The control for the whole table: without it every row above would pass
    // just as well against a reader that had stopped finding anything.
    // The floor constrains exactly two fields and no more, so a variant with
    // no payload is a legal variant.
    expect(
      declaredError(atTheMarkerAddress({ tag: 'unauthorized', status: 401 }))
    ).toEqual({ tag: 'unauthorized', status: 401 })
  })
})

describe('values that carry no marker at all', () => {
  /**
   * The three hops are `err.data.data.__declaredError__` and **only** those.
   * A marker one hop short or one hop deep is not this envelope, and the
   * one-hop-deep row is the escaped-callee case: were the reader to
   * walk further it would start reporting a *callee's* declared failure as the
   * caller's own.
   */
  const undeclared: readonly (readonly [string, unknown])[] = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'boom'],
    ['a number', 403],
    ['a boolean', true],
    ['a plain Error', new Error('boom')],
    ['an object with no data at all', { statusCode: 500 }],
    ['an object whose data has no data', { data: { statusCode: 500 } }],
    [
      'a framework error with data of its own',
      { data: { data: { reason: 'hand-rolled' } } },
    ],
    [
      'a marker one hop short',
      { data: { [DECLARED_ERROR_KEY]: { tag: 'forbidden', status: 403 } } },
    ],
    [
      'a marker at the top level',
      { [DECLARED_ERROR_KEY]: { tag: 'forbidden', status: 403 } },
    ],
    [
      'a marker one hop deep, as an escaped callee would put it',
      {
        data: {
          data: { data: { [DECLARED_ERROR_KEY]: { tag: 'x', status: 403 } } },
        },
      },
    ],
    [
      // Nitro's production serializer wipes `data` entirely when
      // `unhandled || fatal`, while `statusMessage` is not gated and still
      // carries the callee's tag. The reader must not reconstruct a variant out
      // of that — the failure degrades to undeclared, which is the safe
      // direction. `test/e2e/wire.test.ts` runs this against a real build.
      'a production-stripped body whose statusMessage still names the tag',
      {
        data: {
          error: true,
          url: '/api/escaped-callee',
          statusCode: 404,
          statusMessage: 'user-not-found',
          message: 'Server Error',
        },
      },
    ],
  ]

  it.each(undeclared)('reads %s as undeclared', (_label, value) => {
    expect(declaredError(value)).toBeUndefined()
  })
})

describe('the reactive sibling', () => {
  it('computes the same answer the value form gives', () => {
    const error = clientErrorFor('42')

    expect(useDeclaredError(ref(error)).value).toEqual(declaredError(error))
  })

  it('recomputes when the ref it was given changes', () => {
    // The point of the composable over a one-shot read: `error` is a ref that
    // gets filled in after the request settles, and a template holding the
    // answer has to follow it.
    const source = ref<unknown>(undefined)
    const failure = useDeclaredError(source)

    expect(failure.value).toBeUndefined()

    source.value = clientErrorFor('42')

    expect(failure.value).toEqual({
      tag: 'user-not-found',
      status: 404,
      userId: '42',
    })

    source.value = atTheMarkerAddress({ tag: 'forbidden' })

    expect(failure.value).toBeUndefined()
  })

  it('accepts a computed as its source, not only a writable ref', () => {
    // The parameter is Vue's own `Ref`, and a `ComputedRef` is one — the
    // type-level half of that claim, over all four ref flavours a call site can
    // hold, is in `test/types/pos/reader.ts`.
    const source = ref('42')
    const derived = computed(() => clientErrorFor(source.value))

    expect(useDeclaredError(derived).value).toMatchObject({ userId: '42' })

    source.value = '99'

    expect(useDeclaredError(derived).value).toMatchObject({ userId: '99' })
  })
})
