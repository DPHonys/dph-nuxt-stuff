import { matchError } from '@dphonys/better-handler/shared'
import type {
  BetterFetch,
  KnownErrorFor,
  ValidationFailed,
} from '@dphonys/better-handler/types'
import type { NuxtError } from 'nuxt/app'
import { ref } from 'vue'

/**
 * The five composables' call sites to this app's routes, typed by the map
 * `nuxt prepare` generated beside Nitro's route types. Compiler-asserted, as
 * `fetch.check.ts` is: `pnpm typecheck` runs `vue-tsc` over this project, on
 * the Nuxt 4.0 floor as on the latest 4.x. The refusals are in the package's
 * own suite, which asserts them by code and line.
 */

/** Restated rather than imported: an app has no business in a test tree. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

/** What `/api/users` answers: the handler's own return. */
interface Created {
  created: string
  age: number
}

/** The Tagged error inside the body of an error ref's `NuxtError`. */
type TaggedIn<Ref> =
  NonNullable<Ref> extends NuxtError<infer Body>
    ? Body extends { data: infer Variant }
      ? Variant
      : never
    : never

/** `useBetterFetch`: a body typed as its schema's input, reactive. */
export function createUser(): void {
  const name = ref('Ada')
  const { data: _data, error: _error } = useBetterFetch('/api/users', {
    method: 'POST',
    body: { name, age: 36 },
  })

  type _Data = Assert<Equal<typeof _data.value, Created | undefined>>
  type _Error = Assert<
    Equal<typeof _error.value, KnownErrorFor<'/api/users', 'post'> | undefined>
  >
  type _Tagged = Assert<Equal<TaggedIn<typeof _error.value>, ValidationFailed>>
}

/** `useLazyBetterFetch`: a query before its transform, from a getter. */
export function search(): void {
  const page = ref('2')
  const { data: _data } = useLazyBetterFetch('/api/search', {
    query: () => ({ page: page.value }),
  })

  type _Data = Assert<Equal<typeof _data.value, { page: number } | undefined>>
}

/**
 * `useBetterAsyncData`: the handler's `.try` result unwrapped, and its Known
 * errors in the body of the `error` ref, which `matchError` reads by `_tag`.
 */
export async function invoice(): Promise<void> {
  const { data: _data, error } = await useBetterAsyncData('invoice', () =>
    $betterFetch.try('/api/invoices/7')
  )

  type _Data = Assert<
    Equal<typeof _data.value, { id: number; total: number } | undefined>
  >
  type _Tagged = Assert<
    Equal<
      TaggedIn<typeof error.value>,
      { _tag: 'invoice-not-found'; id: number } | ValidationFailed
    >
  >

  matchError(
    error,
    {
      'invoice-not-found': ({ id }) => console.warn('no invoice', id),
      'validation-failed': ({ issues }) => console.warn(issues.length),
      'request-failed': ({ status }) => console.warn('failed', status),
    },
    (unknown) => console.warn('unknown failure', unknown._tag)
  )
}

/**
 * `useLazyBetterAsyncData` over `useRequestBetterFetch`, which forwards the
 * rendered request's cookies while rendering.
 */
export function health(): void {
  const request = useRequestBetterFetch()

  type _Request = Assert<Equal<typeof request, BetterFetch>>

  const { data: _data } = useLazyBetterAsyncData('health', () =>
    request.try('/api/health')
  )

  type _Data = Assert<
    Equal<typeof _data.value, { ok: true; at: string } | undefined>
  >
}
