import { orderRef } from '../../validation/schemas'

/**
 * An `input`-only route declaring the `route` source alone: the first source
 * in the fail-fast order, carried to the client as the umbrella's variant.
 */
export default defineTypedEventHandler(
  { input: { route: orderRef } },
  (_event, { route }) => ({ id: route.id })
)
