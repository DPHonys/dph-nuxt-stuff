import { DECLARED_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'
import { SHARED_CONTEXT_PROBE } from '#shared/specifier-probe'

/** Context 2 of 3: the Nitro server. */
type _ServerContextErrorMap = TypedApiErrors

export default defineEventHandler(() => ({
  server: `server:${DECLARED_ERROR_KEY}`,
  shared: SHARED_CONTEXT_PROBE,
}))
