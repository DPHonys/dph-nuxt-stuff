import { readRawBody } from 'h3'
import { userErrors } from '../errors/users'

/** An `errors`-only `POST`: the body is the handler's to read, or not. */
export default defineTypedEventHandler(
  {
    errors: userErrors.pick('user-not-found'),
  },
  async (event) => ({ reached: true, raw: (await readRawBody(event)) ?? null })
)
