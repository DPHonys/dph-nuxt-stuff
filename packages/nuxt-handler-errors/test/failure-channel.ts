/**
 * The two shapes both fetch-wrapper suites need, written once.
 *
 * `test/typed-fetch.test.ts` and `test/event-typed-fetch.test.ts` are
 * deliberately parallel — same wrapper shape, same `.safe` contract — and
 * "one shared helper would be a defect" is about the **header merge** and the
 * fakes that model it, which stay per-file because the thing
 * underneath each surface really does merge differently. It says nothing about
 * the scaffolding, and two copies of *that* can drift while both suites keep
 * passing.
 *
 * Named for what both helpers are about — which channel a failure left by, and
 * what a declared one looks like on the wire.
 *
 * Not a Vitest test file, so it is not matched by `vitest.config.ts`'s
 * `include`; knip reaches it by following the imports from the two suites that
 * use it.
 */

import { DECLARED_ERROR_KEY } from '../src/runtime/shared'

/**
 * An error body carrying a well-formed declared marker, exactly as the wire has
 * it.
 *
 * Three hops — ofetch defines `FetchError.data` as a getter over the whole
 * response body, and `createError` copies `input.data` wholesale — and the key
 * is derived from the constant rather than restated, because the key is
 * *renameable* protocol.
 */
export function declaredFailure(variant: unknown): unknown {
  return { data: { data: { [DECLARED_ERROR_KEY]: variant } } }
}

/** Whether a call threw, and with what. */
export interface Settled {
  readonly threw: boolean
  readonly value: unknown
}

/**
 * Run something and report how it settled.
 *
 * The pair rather than the value, because on both surfaces `.safe`'s contract
 * is about *which channel* a failure leaves by: a rethrow that carried the same
 * instance and a resolution that reported a declared failure are two different
 * passes, and an assertion that could not tell them apart would be satisfied by
 * a `.safe` that threw unconditionally.
 */
export async function settled(run: () => Promise<unknown>): Promise<Settled> {
  try {
    return { threw: false, value: await run() }
  } catch (error) {
    return { threw: true, value: error }
  }
}
