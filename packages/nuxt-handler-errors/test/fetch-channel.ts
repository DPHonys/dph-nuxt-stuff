/**
 * The two shapes both fetch-wrapper suites need, written once.
 *
 * `test/unit/checked-fetch.test.ts` and `test/unit/event-checked-fetch.test.ts`
 * are deliberately parallel — same wrapper shape, same `.try` contract — and
 * "one shared helper would be a defect" is about the **header merge** and the
 * fakes that model it, which stay per-file because the thing underneath each
 * surface really does merge differently. It says nothing about the scaffolding,
 * and two copies of *that* can drift while both suites keep passing.
 *
 * Not a Vitest test file, so it is not matched by `vitest.config.ts`'s
 * `include`; knip reaches it by following the imports from the suites using it.
 */

import { KNOWN_ERROR_KEY } from '../src/runtime/shared'

/**
 * An error body carrying a well-formed marker, exactly as the wire has it.
 *
 * Two `data`s, both the framework's — ofetch defines `FetchError.data` as a
 * getter over the whole response body, and Nitro's serializer puts the thrown
 * error's `data` inside it — and the key is derived from the constant rather
 * than restated, because the key is *renameable* protocol.
 */
export function knownFailure(variant: unknown): unknown {
  return {
    message: 'nope',
    // ofetch's `FetchError` carries these as getters over the response; they
    // are what h3's `createError` copies onto the carrier.
    statusCode: 404,
    statusMessage: 'Not Found',
    data: {
      error: true,
      url: '/api/anything',
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'nope',
      data: { [KNOWN_ERROR_KEY]: variant },
    },
  }
}

/** Whether a call threw, and with what. */
export interface Settled {
  readonly threw: boolean
  readonly value: unknown
}

/**
 * Run something and report how it settled — the pair rather than the value,
 * because `.try`'s contract is that a failure comes back through the `error`
 * arm and not through `throw`, and an assertion that could not tell those apart
 * would be satisfied by a wrapper that rethrew everything.
 */
export async function settled(run: () => Promise<unknown>): Promise<Settled> {
  try {
    return { threw: false, value: await run() }
  } catch (error) {
    return { threw: true, value: error }
  }
}
