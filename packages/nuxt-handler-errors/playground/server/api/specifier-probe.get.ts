import {
  DECLARED_ERROR_KEY,
  declaredError,
} from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'
import { SHARED_CONTEXT_PROBE } from '#shared/specifier-probe'

/** Context 2 of 3: the Nitro server. */
type _ServerContextErrorMap = TypedApiErrors

/**
 * The explicit return annotation is SPEC.md §6.6's cycle, not a preference: a
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

    // SPEC.md §3.7's own first use case for the value form — *"imperative code,
    // catch blocks, server-to-server"* — run rather than compiled. This is the
    // third of the three contexts the ticket's side-agnostic criterion names,
    // and the only one no client-side call site can stand in for: `/shared` now
    // carries a `vue` import (SPEC-AMENDMENTS item 25), so *"it still resolves
    // and still runs inside Nitro"* is a claim that has to be executed.
    //
    // `.safe()` is what SPEC.md §6.5 says to prefer here; it does not exist yet
    // (ticket 11), and this is what the shape looks like without it.
    caught: await $fetch('/api/users/suspended').then(
      () => 'no failure',
      (thrown: unknown) => declaredError(thrown)?.tag ?? 'not declared'
    ),
  }
})
