import { DECLARED_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'

/**
 * Context 3 of 3: a consumer's `shared/` directory, which is the context the
 * subpath exports exist for. The bare `.` specifier is import-protected here by
 * Nuxt, so `/types` and `/shared` are the only hand-writable way in
 * (SPEC.md §3).
 */
type _SharedContextErrorMap = TypedApiErrors

export const SHARED_CONTEXT_PROBE = `shared:${DECLARED_ERROR_KEY}`
