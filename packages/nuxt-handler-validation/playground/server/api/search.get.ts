import { pagination } from '~~/server/validation/schemas'

/**
 * A bad query, the smallest failure this package answers.
 *
 * There is deliberately **no import** of this package here: the module
 * registers `defineValidatedEventHandler` as a server auto-import, and this
 * route is where that registration is proven through a real build rather than
 * against a booted config. The explicit `/server` door is exercised by
 * `server/plugins/observe-validation-failures.ts`.
 */
export default defineValidatedEventHandler(
  { validate: { query: pagination } },
  (_event, { query }) => ({ page: query.page })
)
