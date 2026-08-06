/**
 * A hermetic replica of the two framework error types the reader is written
 * against.
 *
 * **Why a replica rather than the real declarations.** The reference install's
 * own `.d.ts` files do not resolve their transitive dependencies from outside
 * the install: `nuxt/dist/app/composables/error.d.ts` reaches `H3Error` through
 * `@nuxt/nitro-server/h3`, and a fixture program that resolves *neither* gets a
 * silent collapse rather than a diagnostic — the probe degrades to `any` and
 * every assertion written against it passes vacuously. That already happened
 * once during the map work, which is why the reader
 * is verified against types this file owns and the *real* ones are exercised at
 * layer 3, in `playground/`, where they resolve because the app is inside the
 * install.
 *
 * Copied field for field from h3 1.15.11 (`dist/index.d.ts:324-336`) and Nuxt
 * 4.5.1 (`dist/app/composables/error.d.ts:10-19`). Nothing is simplified: the
 * point of a replica is that the reader meets the same optional-property and
 * `Omit` shapes it will meet in a consumer's app, including the deprecated
 * `statusCode`/`statusMessage` pair Nuxt re-declares as optional.
 *
 * It is a `.ts` module rather than an ambient `.d.ts` so a fixture reaches it
 * by an ordinary `import type`, which is what keeps it out of every program
 * that does not ask for it.
 */

/** h3 1.15.11's `H3Error`. */
export declare class H3Error<DataT = unknown> extends Error {
  static __h3_error__: boolean
  statusCode: number
  fatal: boolean
  unhandled: boolean
  statusMessage?: string
  data?: DataT
  cause?: unknown
  constructor(message: string, opts?: { cause?: unknown })
  toJSON(): Pick<
    H3Error<DataT>,
    'message' | 'statusCode' | 'statusMessage' | 'data'
  >
}

/**
 * Nuxt 4.5.1's `NuxtError` — the type a client's `error` ref actually holds.
 *
 * `data` arrives through the `Omit<H3Error<DataT>, …>` half and stays optional,
 * which is the property the reader's first overload has to infer through.
 */
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
