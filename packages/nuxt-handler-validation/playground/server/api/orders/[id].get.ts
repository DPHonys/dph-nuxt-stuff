import { orderRef } from '~~/server/validation/schemas'

/**
 * A bad route param - the first source in the fail-fast order, and the only
 * one this route declares.
 */
export default defineValidatedEventHandler(
  { input: { route: orderRef } },
  (_event, { route }) => ({ id: route.id })
)
