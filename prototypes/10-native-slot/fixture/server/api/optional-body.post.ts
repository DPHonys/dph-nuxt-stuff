import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Body input admits undefined: Nuxt applies NonNullable, our map does not.
export default defineBetterEventHandler(
  { input: { body: schema<{ a: string } | undefined>() } },
  (_event, { body }) => ({ a: body?.a ?? '' })
)
