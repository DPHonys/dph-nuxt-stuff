import { matchError } from '@dphonys/better-handler/shared'
import type {
  BetterRequestOptions,
  RequestFailed,
  ValidationFailed,
} from '@dphonys/better-handler/types'

/**
 * `$betterFetch` call sites to this app's routes, typed by the map
 * `nuxt prepare` generated beside Nitro's route types. Compiler-asserted, as
 * `known-errors.check.ts` is: `pnpm typecheck` runs `vue-tsc` over this
 * project, on the Nuxt 4.0 floor as on the latest 4.x. The refusals are in
 * the package's own suite, which asserts them by code and line.
 */

/** Restated rather than imported: an app has no business in a test tree. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

/** A body typed as its schema's input, the method in either case. */
export async function createUser(): Promise<void> {
  const _created = await $betterFetch('/api/users', {
    method: 'POST',
    body: { name: 'Ada', age: 36 },
  })

  type _Created = Assert<
    Equal<typeof _created, { created: string; age: number }>
  >
}

/** A query before its transform, required. */
export type SearchQueryHolds = Assert<
  Equal<
    Pick<BetterRequestOptions<'/api/search', 'get'>, 'query'>,
    { query: { page: string } }
  >
>

/** No `body` at all on a `get` to a route of this package. */
export type SearchBodyHolds = Assert<
  Equal<
    Extract<keyof BetterRequestOptions<'/api/search', 'get'>, 'body'>,
    never
  >
>

/** The response is the declared output's output, as JSON carries it. */
export async function receipt(): Promise<void> {
  const _sent = await $betterFetch('/api/receipts', {
    method: 'post',
    query: { dryRun: 'no' },
    body: { total: 12 },
  })

  type _Sent = Assert<
    Equal<typeof _sent, { id: number; total: number; at: string } | null>
  >
}

/** `.try` is exhaustive on `_tag`: a `switch` with no hole and no fallback. */
export async function invoice(): Promise<string> {
  const { data, error } = await $betterFetch.try('/api/invoices/7')

  if (!error) return `invoice ${data.id}`

  switch (error._tag) {
    case 'invoice-not-found':
      return `no invoice ${error.id}`
    case 'validation-failed': {
      type _Issues = Assert<Equal<typeof error, ValidationFailed>>
      return 'bad invoice id'
    }
    case 'request-failed': {
      type _Failed = Assert<Equal<typeof error, RequestFailed>>
      return `failed with ${error.status ?? 'no response'}`
    }
  }
}

/** A `.try` error goes to `matchError` as it is. */
export async function order(): Promise<void> {
  const { error } = await $betterFetch.try('/api/orders/7')

  matchError(
    error,
    {
      'order-not-found': ({ id }) => console.warn('missing', id),
      'order-locked': () => console.warn('locked'),
      unauthorized: () => console.warn('sign in'),
      forbidden: ({ requiredRole }) => console.warn('needs', requiredRole),
      'request-failed': ({ status }) => console.warn('failed', status),
    },
    (unknown) => console.warn('unknown failure', unknown._tag)
  )
}
