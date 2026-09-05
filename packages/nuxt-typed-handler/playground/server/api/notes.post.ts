import { readRawBody } from 'h3'
import { z } from 'zod'

/** An `errors`-only `POST`: the body is the handler's to read, or not. */
export default defineTypedEventHandler(
  {
    errors: {
      'user-not-found': { status: 404, data: z.object({ userId: z.string() }) },
    },
  },
  async (event) => ({ reached: true, raw: (await readRawBody(event)) ?? null })
)
