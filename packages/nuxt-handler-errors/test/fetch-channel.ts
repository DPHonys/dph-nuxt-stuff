/**
 * Shared shapes for the fetch-wrapper suites. Not a Vitest test file, so it is
 * not matched by `vitest.config.ts`'s `include`; knip reaches it through the
 * suites importing it.
 */

import { KNOWN_ERROR_KEY } from '../src/runtime/shared'
import type { KnownErrorBody } from '../src/runtime/shared/wire'
import type { KnownVariant } from '../src/runtime/types'

/** ofetch's `FetchError`, reduced to what the wire suites read off it. */
export interface FetchedFailure<
  E extends KnownVariant = KnownVariant,
> extends Error {
  statusCode: number
  statusMessage: string
  data: KnownErrorBody<E>
}

/**
 * An error body carrying a well-formed marker, exactly as the wire has it:
 * ofetch's `FetchError.data` is the whole response body, and Nitro's
 * serializer puts the thrown error's `data` inside it.
 */
export function knownFailure<E extends KnownVariant>(
  variant: E
): FetchedFailure<E> {
  return Object.assign(new Error('nope'), {
    statusCode: 404,
    statusMessage: 'Not Found',
    data: {
      error: true as const,
      url: '/api/anything',
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'nope',
      data: { [KNOWN_ERROR_KEY]: variant },
    },
  })
}

/** Whether a call threw, and with what. */
export type Settled<T> =
  | { readonly threw: false; readonly value: T }
  | { readonly threw: true; readonly value: unknown }

/**
 * Run something and report how it settled - the pair rather than the value,
 * so assertions can tell a `.try` failure arm from a rethrow.
 */
export async function settled<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { threw: false, value: await run() }
  } catch (error) {
    return { threw: true, value: error }
  }
}
