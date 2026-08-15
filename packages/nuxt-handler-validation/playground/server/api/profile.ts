import { z } from 'zod'

/**
 * A route file with **no method suffix** - one handler answering every method,
 * which is a first-class Nitro pattern - that nevertheless declares a body.
 *
 * A `GET` cannot carry one, so the body read is skipped entirely and the body
 * source validates `undefined`. Expressing "optional body" is therefore the
 * schema's job, like every other kind of optionality, and the route keeps
 * working instead of answering h3's bare `405`.
 */
export default defineValidatedEventHandler(
  { validate: { body: z.object({ nickname: z.string() }).optional() } },
  (event, { body }) => ({
    method: event.method,
    nickname: body?.nickname ?? null,
  })
)
