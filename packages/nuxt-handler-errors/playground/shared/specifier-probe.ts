import { DECLARED_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'

/**
 * Context 3 of 3: a consumer's `shared/` directory, which is the context the
 * subpath exports exist for. The bare `.` specifier is import-protected here by
 * Nuxt and `/server` is barred by the directory itself — a `shared/` file
 * compiles into the client program too, and `/server` reaches `h3` — so
 * `/types` and `/shared` are the only hand-writable way in.
 */
type _SharedContextErrorMap = TypedApiErrors

/**
 * And the augmentation binds here too, which it does through
 * `addTypeTemplate`'s `shared: true`. Indexing a real route key
 * rather than merely naming the interface is what makes this an assertion:
 * without that flag the augmentation never reaches this context, the published
 * interface stays empty, and this line is `TS2339`.
 */
type _SharedContextSeesTheMap = TypedApiErrors['/api/users/:id']['get']

export const SHARED_CONTEXT_PROBE = `shared:${DECLARED_ERROR_KEY}`
