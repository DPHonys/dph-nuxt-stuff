import { z } from 'zod'

/**
 * No method suffix on purpose. A `GET` skips the body read, so the body source
 * validates `undefined` and "optional body" is the schema's job.
 */
export default defineValidatedEventHandler(
  { validate: { body: z.object({ nickname: z.string() }).optional() } },
  (event, { body }) => ({
    method: event.method,
    nickname: body?.nickname ?? null,
  })
)
