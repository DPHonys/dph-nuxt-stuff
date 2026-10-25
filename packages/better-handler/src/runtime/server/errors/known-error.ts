import type { H3Error } from 'h3'
import { httpError } from '../../shared/h3'
import type { TaggedError } from '../../types/errors/tagged'

/**
 * The one construction every Known error goes through, a declared one the
 * boundary recognised and the Built-in validation-failed variant alike: an h3
 * error with the given status, the tag as its `message`, and the Tagged error
 * as its `data`. What `recognizeKnownError` and the client classifier read is
 * therefore one shape, whichever path raised it.
 */
export function createKnownError<Tagged extends TaggedError>(
  status: number,
  tagged: Tagged
): H3Error<Tagged> {
  return httpError({ status, message: tagged._tag, data: tagged })
}
