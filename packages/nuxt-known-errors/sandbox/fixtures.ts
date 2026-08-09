// Everything the sandbox needs that is not the design: framework types
// replicated field for field, and three fictional routes standing in for the
// emitter's output. A program that only partially resolves the real
// declarations degrades to `any`, and every assertion then passes vacuously.

// --- Framework replicas ----------------------------------------------------

/** Vue's `Ref`, reduced. Covariant in `T`, so `ComputedRef` matches too. */
export interface Ref<T> {
  value: T
}

/** Vue's `watch`, reduced to the one overload the reactive call style writes. */
export declare function watch<T>(
  source: Ref<T>,
  callback: (value: T) => void,
  options?: { immediate?: boolean }
): void

/** h3's `H3Event`, reduced to existence. The real class is generic and
 * declared in h3's own resolvable `dist/index.d.ts`, which is what makes the
 * `$checkedFetch` augmentation in `matcher.ts` possible — see DESIGN §5. */
export interface H3Event {
  path: string
}

/** h3's `defineEventHandler`, reduced to the async shape the call sites use. */
export declare function defineEventHandler<T>(
  handler: (event: H3Event) => T | Promise<T>
): (event: H3Event) => Promise<T>

/** h3's `createError`, reduced to the throw-site call. */
export declare function createError(input: {
  statusCode?: number
  statusMessage?: string
  message?: string
  data?: unknown
  cause?: unknown
}): H3Error

/** h3 1.15.11's `H3Error` (`dist/index.d.ts:324-336`). */
export declare class H3Error<DataT = unknown> extends Error {
  static __h3_error__: boolean
  statusCode: number
  fatal: boolean
  unhandled: boolean
  statusMessage?: string
  data?: DataT
  cause?: unknown
  constructor(message: string, opts?: { cause?: unknown })
}

/** Nuxt 4.5.1's `NuxtError` (`dist/app/composables/error.d.ts:10-19`). */
export interface NuxtError<DataT = unknown>
  extends Omit<H3Error<DataT>, 'statusCode' | 'statusMessage'>, Error {
  readonly __nuxt_error?: true
  error?: true
  status?: number
  statusText?: string
  /** @deprecated Use `status` */
  statusCode?: H3Error<DataT>['statusCode']
  /** @deprecated Use `statusText` */
  statusMessage?: H3Error<DataT>['statusMessage']
}

/** Nuxt's `useAsyncData`, reduced to a custom handler and the two members the
 * sandbox reads. The error ref is vanilla `NuxtError` — a handler's rejection
 * carries no type, so there is nothing for a wrapper to sharpen. See DESIGN §4. */
export declare function useAsyncData<T>(
  key: string,
  handler: () => Promise<T>
): Promise<{
  data: Ref<T | undefined>
  error: Ref<NuxtError | undefined>
}>

// --- Vanilla's asyncData option machinery -----------------------------------
// Replicated reduced from nuxt 4.5.1 `asyncData.d.ts`. The real package does
// not own these: it imports `AsyncDataOptions` and friends from nuxt, which is
// what "as close to vanilla as possible" means for the options. Elided the
// same way everything here is: `getCachedData`, `enabled`, `timeout`, and the
// `NuxtApp` handler parameter go unmodelled because no call site reads them.

export type KeysOf<T> = Array<
  T extends T ? (keyof T extends string ? keyof T : never) : never
>

export type PickFrom<T, K extends Array<string>> =
  T extends Array<unknown>
    ? T
    : T extends Record<string, unknown>
      ? keyof T extends K[number]
        ? T
        : K[number] extends never
          ? T
          : Pick<T, K[number] & keyof T>
      : T

export interface AsyncDataOptions<
  ResT,
  DataT = ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = undefined,
> {
  server?: boolean
  lazy?: boolean
  immediate?: boolean
  deep?: boolean
  dedupe?: 'cancel' | 'defer'
  watch?: Ref<unknown>[]
  default?: () => DefaultT | Ref<DefaultT>
  pick?: PickKeys
  transform?: (input: ResT) => DataT | Promise<DataT>
}

/** Vanilla's `_AsyncData`, reduced to the members the evidence reads —
 * `pending`, `execute`, `clear` and the awaitable dual form ride along at
 * implementation time because underneath it is vanilla `useAsyncData`. */
export interface AsyncDataResult<DataT, ErrorT> {
  data: Ref<DataT>
  error: Ref<ErrorT | undefined>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
  refresh: () => Promise<void>
}

// --- Route fixtures --------------------------------------------------------

// What the emitter would generate. Simplified twice, both irrelevant to
// ergonomics: keys match exactly rather than through Nitro's `MatchedRoutes`
// scoring, and only `get` is modelled.
export interface KnownApiErrors {
  '/api/users/:id': {
    get:
      | { tag: 'user-not-found'; status: 404; userId: string }
      | { tag: 'user-suspended'; status: 403; until: string }
      | { tag: 'forbidden'; status: 403; requiredRole: 'admin' | 'owner' }
  }
  /** One variant only — the case where a `switch` needs no `default`. */
  '/api/chain/c': {
    get: { tag: 'c-gone'; status: 410; resource: string }
  }
  /** A route that opted in to nothing. The degradation lock's test case. */
  '/api/boom': {
    get: never
  }
}

/** A route's known union from its path alone. `never` means "declares none". */
export type KnownErrorsOf<R extends string> = R extends keyof KnownApiErrors
  ? KnownApiErrors[R]['get']
  : never

// Stands in for Nitro's `TypedInternalResponse<R, T, M>`; the real package
// indexes it out of `Base$Fetch`'s own return position rather than restating it.
export interface ApiResponses {
  '/api/users/:id': { id: string; name: string }
  '/api/chain/c': { ok: true }
  '/api/boom': { fine: boolean }
}

/** Undeclared routes answer `unknown`, exactly as vanilla's default `T` does. */
export type ResponseOf<R extends string> = R extends keyof ApiResponses
  ? ApiResponses[R]
  : unknown
