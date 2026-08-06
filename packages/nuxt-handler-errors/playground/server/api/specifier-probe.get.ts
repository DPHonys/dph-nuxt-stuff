import {
  DECLARED_ERROR_KEY,
  declaredError,
} from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'
import { SHARED_CONTEXT_PROBE } from '#shared/specifier-probe'

/** Context 2 of 3: the Nitro server. */
type _ServerContextErrorMap = TypedApiErrors

/**
 * The explicit return annotation is Nitro's own `InternalApi` cycle, not a
 * preference: a
 * handler whose return type is inferred from a `$fetch` call needs
 * `InternalApi` to type the call and needs the call to type its own
 * `InternalApi` entry. Measured on this app without it: `TS2321 Excessive stack
 * depth` in `MatchedRoutes`' scoring conditional, once per route key.
 */
interface SpecifierProbe {
  server: string
  shared: string
  caught: string
}

export default defineEventHandler(async (): Promise<SpecifierProbe> => {
  return {
    server: `server:${DECLARED_ERROR_KEY}`,
    shared: SHARED_CONTEXT_PROBE,

    // The value form's own first use case — *"imperative code,
    // catch blocks, server-to-server"* — run rather than compiled. This is the
    // third of the three contexts the ticket's side-agnostic criterion names,
    // and the only one no client-side call site can stand in for. Nothing
    // reachable from `/shared` imports `vue`, `h3` or `#app` any more, so
    // *"it still resolves and still runs inside Nitro"* is the claim, and it
    // has to be executed rather than reasoned about.
    //
    // `.safe()` is the shape to prefer here; it does not exist yet
    // (ticket 11), and this is what the shape looks like without it.
    caught: await $fetch('/api/users/suspended').then(
      () => 'no failure',
      (thrown: unknown) => declaredError(thrown)?.tag ?? 'not declared'
    ),
  }
})
