import { schema } from '../lib/schema'
import { defineTypedEventHandler } from '../lib/typed-handler'

/** Validates only `routerParams`: branded, but `body`/`query` are undeclared → vanilla. */
export default defineTypedEventHandler(
  { validate: { routerParams: schema<{ slug: string }>() } },
  (_event, ctx) => {
    // @ts-expect-error - validate-only → no fail
    void ctx.fail
    return { slug: ctx.routerParams.slug }
  }
)
