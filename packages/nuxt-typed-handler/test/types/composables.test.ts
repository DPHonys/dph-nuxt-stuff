import { it } from 'vitest'
import { ref } from 'vue'
import type { ValidationFailed } from '../../src/runtime/types'
import type { Forbidden, UserCreated, UserList } from './request-routes'

/**
 * The composables' compile-time contract over the hand-written map in
 * `request-routes.ts`, asserted by the compiler under `pnpm typecheck`. The
 * request side is the same contract `request-typing.test.ts` asserts, re-added
 * reactive; what is asserted here is the reactive re-adding and the two refs.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

// Declared rather than imported: these live behind `#app`, which does not
// resolve under a plain `vitest run`. `typeof import(…)` is a type query - it
// asserts the real declaration and emits no import.
declare const useTypedFetch: typeof import('../../src/runtime/app/composables/use-typed-fetch').useTypedFetch
declare const useLazyTypedFetch: typeof import('../../src/runtime/app/composables/use-typed-fetch').useLazyTypedFetch
declare const useTypedAsyncData: typeof import('../../src/runtime/app/composables/use-typed-async-data').useTypedAsyncData
declare const $typedFetch: typeof globalThis.$typedFetch

/** `data` is the route's response; `error` is its declared union. */
export function refTypes(): void {
  const _created = useTypedFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't' },
  })
  type _data = Expect<
    Equal<typeof _created.data.value, UserCreated | undefined>
  >

  if (_created.error.value) {
    type _error = Expect<
      Equal<
        NonNullable<typeof _created.error.value.data>['data']['__knownError__'],
        Forbidden | ValidationFailed
      >
    >
  }

  const _listed = useTypedFetch('/api/users')
  type _get = Expect<Equal<typeof _listed.data.value, UserList | undefined>>

  // The lazy twin carries the same signature; only `lazy` is pre-set.
  const _lazy = useLazyTypedFetch('/api/users')
  type _lazyData = Expect<Equal<typeof _lazy.data.value, UserList | undefined>>
}

/** Each typed source is accepted plain, through a `ref`, or through a getter. */
export function reactiveSources(): void {
  const body = ref({ name: 'a', age: '1' })

  useTypedFetch('/api/users', {
    method: 'post',
    body,
    query: () => ({ team: 't' }),
  })

  useTypedFetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '1' },
    query: { team: 't', page: ref(1) },
  })

  useTypedFetch('/api/plain', { query: { anything: ref(1) } })
}

/** Requiredness, excess keys and `params` are the imperative contract's. */
export function requestSideIsTheSameContract(): void {
  // @ts-expect-error - the declared body is required here too
  useTypedFetch('/api/users', { method: 'post', query: { team: 't' } })

  useTypedFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - excess key on a plain literal body
    body: { name: 'a', age: '1', extra: 1 },
    query: { team: 't' },
  })

  // @ts-expect-error - `params` is gone here too
  useTypedFetch('/api/users', { params: { a: 1 } })

  // A caveat, not a contract row: through a getter or a `ref()` the excess
  // check does not fire - `Reactive<T>` is a union target and `ref()` infers
  // its own type. Documented in the README's *Request typing* section.
  useTypedFetch('/api/users', {
    method: 'post',
    body: () => ({ name: 'a', age: '1', extra: 1 }),
    query: { team: 't' },
  })

  useTypedFetch('/api/users', {
    method: 'post',
    // @ts-expect-error - but a wrong value type through a getter is still caught
    body: () => ({ name: 'a', age: 1 }),
    query: { team: 't' },
  })
}

/** `useTypedAsyncData` reads its union off the handler's `.try` result. */
export async function asyncDataUnion(): Promise<void> {
  const { data: _data, error } = await useTypedAsyncData('user', () =>
    $typedFetch.try('/api/users', {
      method: 'post',
      body: { name: 'a', age: '1' },
      query: { team: 't' },
    })
  )

  type _asyncData = Expect<Equal<typeof _data.value, UserCreated | undefined>>

  if (error.value) {
    type _error = Expect<
      Equal<
        NonNullable<typeof error.value.data>['data']['__knownError__'],
        Forbidden | ValidationFailed
      >
    >
  }

  // @ts-expect-error - the handler must return a try-shape, not raw data
  await useTypedAsyncData('users', () => $typedFetch('/api/users'))
}

it('is asserted by the compiler', () => {})
