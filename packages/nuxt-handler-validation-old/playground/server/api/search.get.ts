import { z } from 'zod'

/**
 * A bad query, the smallest failure this package answers.
 *
 * There is deliberately **no import** of this package here: the module
 * registers `defineValidatedEventHandler` as a server auto-import, and this
 * route is where that registration is proven through a real build rather than
 * against a booted config. The explicit `/server` door is exercised by
 * `server/plugins/observe-validation-failures.ts`.
 *
 * Every schema in this playground carries its **own** message, so the wire
 * assertions pin this app's contract rather than whichever wording the schema
 * library ships this week.
 */
export default defineValidatedEventHandler(
  {
    query: z.object({
      page: z
        .string()
        .regex(/^\d+$/, 'page must be a whole number')
        .transform(Number),
    }),
  },
  (_event, { query }) => ({ page: query.page })
)
