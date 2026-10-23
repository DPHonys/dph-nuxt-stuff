import { defineBetterEventHandler } from '../../../../lib/handler'
import { schema } from '../../../../lib/schema'

/** Validates only `route`: branded, but body/query undeclared, so vanilla. */
export default defineBetterEventHandler(
  { input: { route: schema<{ slug: string }>() } },
  (_event, { route }) => ({
    slug: route.slug,
  })
)
