import { matchError } from '@dphonys/better-handler/shared'
import type {
  KnownErrorFor,
  KnownErrorsOfRoute,
  RequestFailed,
  ValidationFailed,
} from '@dphonys/better-handler/types'
import type { NuxtError } from 'nuxt/app'

/**
 * The client's view of this app's routes, read from the map `nuxt prepare`
 * generated from `server/api/` into `.nuxt/types/better-handler.d.ts`. It
 * lives in an app because the map only exists inside one, and it is
 * compiler-asserted: `pnpm typecheck` runs `vue-tsc` over this project.
 */

/** Restated rather than imported: an app has no business in a test tree. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

/** `/api/orders/:id` declares two errors of its own and two shared ones. */
type OrderErrors = KnownErrorsOfRoute<'/api/orders/7'>

export type OrderErrorsHold = Assert<
  Equal<
    OrderErrors,
    | { _tag: 'order-not-found'; id: number }
    | { _tag: 'order-locked' }
    | { _tag: 'unauthorized' }
    | { _tag: 'forbidden'; requiredRole: 'admin' | 'owner' }
  >
>

/** An Effect error class arrives as its fields alone. */
export type EffectErrorHolds = Assert<
  Equal<
    KnownErrorsOfRoute<'/api/effect'>,
    { _tag: 'OrderMissing'; readonly id: number }
  >
>

/**
 * A route declaring `input` carries the Built-in validation-failed variant:
 * as its whole union when it declares nothing else, beside its declared
 * errors when it does.
 */
export type InputOnlyHolds = Assert<
  Equal<KnownErrorsOfRoute<'/api/search'>, ValidationFailed>
>

export type InputAndErrorsHold = Assert<
  Equal<
    KnownErrorsOfRoute<'/api/invoices/7'>,
    { _tag: 'invoice-not-found'; id: number } | ValidationFailed
  >
>

/** The variant's issues, as a client reads them. */
export type ValidationFailedHolds = Assert<
  Equal<
    ValidationFailed['issues'][number],
    {
      source: 'route' | 'query' | 'headers' | 'body'
      message: string
      path: Array<string | number>
    }
  >
>

/** A fetched error carries the Tagged error at `data.data`. */
export type FetchedErrorHolds = Assert<
  Equal<
    NonNullable<KnownErrorFor<'/api/orders/7'>['data']>['data'],
    OrderErrors
  >
>

/**
 * A route Nuxt serves from a JavaScript module the compiler cannot read
 * declares nothing, and stays vanilla.
 */
export type VanillaHolds = Assert<
  Equal<KnownErrorFor<'/__nuxt_error'>, NuxtError<unknown>>
>

declare const ordersError: KnownErrorFor<'/api/orders/7'> | undefined

declare const invoiceError: KnownErrorFor<'/api/invoices/7'> | undefined

/** A rejected input is one more arm, typed with its issues. */
export function handleInvoices(): void {
  matchError(
    invoiceError,
    {
      'validation-failed': ({ issues }) =>
        console.warn(
          issues.map(({ source, path }) => `${source}.${path.join('.')}`)
        ),
      'invoice-not-found': ({ id }) => console.warn('missing', id),
      'request-failed': ({ status }) => console.warn('failed', status),
    },
    (unknown) => console.warn('unknown failure', unknown._tag)
  )
}

/** Every tag an arm, the Request-failed variant included, and a fallback. */
export function handleOrders(): void {
  matchError(
    ordersError,
    {
      'order-not-found': ({ id }) => console.warn('missing', id),
      'order-locked': () => console.warn('locked'),
      unauthorized: () => console.warn('sign in'),
      forbidden: ({ requiredRole }) => console.warn('needs', requiredRole),
      'request-failed': ({ status }: RequestFailed) =>
        console.warn('failed', status),
    },
    (unknown) => console.warn('unknown failure', unknown._tag)
  )
}

/** A missing arm is a compile error, at the arms. */
export function forgetsAnArm(): void {
  matchError(
    ordersError,
    // @ts-expect-error - `forbidden` has no arm
    {
      'order-not-found': () => {},
      'order-locked': () => {},
      unauthorized: () => {},
      'request-failed': () => {},
    },
    () => {}
  )
}
