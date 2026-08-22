import { createError } from 'h3'
import type { NuxtError } from 'nuxt/app'
import type { TryResult } from '../types/fetch'

// The alias-free half of `checked-fetch.ts`: what a module layer can reach
// without the `#nuxt-handler-errors/channel-token` binding.

export type RawTryResult = TryResult<unknown, NuxtError>

// h3's `createError` - the same normalisation `useFetch`'s error ref goes
// through, so one matcher serves both surfaces at one depth.
export function toNuxtError(cause: unknown): NuxtError {
  // `createError(null)` reads `input.message` and throws, and `.try` must be
  // total - a thrown `null` is a failure like any other.
  const input =
    typeof cause === 'string' ||
    (typeof cause === 'object' && cause !== null && !Array.isArray(cause))
      ? cause
      : { message: String(cause) }

  const error = createError(input as Parameters<typeof createError>[0])

  // A bare `H3Error` sets only `statusCode`; the `NuxtError` face this hands
  // out has to be runtime-true on the server as well.
  if (!('status' in error)) {
    Object.defineProperty(error, 'status', {
      get: () => error.statusCode,
      configurable: true,
    })
  }

  if (!('statusText' in error)) {
    Object.defineProperty(error, 'statusText', {
      get: () => error.statusMessage,
      configurable: true,
    })
  }

  return error as NuxtError
}

// Catches everything a fetch can throw - HTTP, network, abort, parse - and
// normalises it; there is no rethrow channel.
export async function toTryResult(
  call: () => Promise<unknown>
): Promise<RawTryResult> {
  try {
    return { data: await call(), error: undefined }
  } catch (cause) {
    return { data: undefined, error: toNuxtError(cause) }
  }
}
