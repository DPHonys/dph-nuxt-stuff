import { itemUpdate } from '../validation/schemas'

/**
 * A method-less (`default`) handler: it answers every verb the route is not
 * keyed for, and both maps key it under `default` rather than a method.
 */
export default defineTypedEventHandler(
  { validate: { body: itemUpdate } },
  (_event, { body }) => ({ qty: body.qty })
)
