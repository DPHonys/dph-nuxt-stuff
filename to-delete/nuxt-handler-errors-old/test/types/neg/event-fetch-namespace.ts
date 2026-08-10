/**
 * `event.$typedFetch` is the bare call signature plus `.safe` —
 * **no `raw` and no instance-creating member**, because that is exactly what
 * `event.$fetch` is.
 *
 * `keyof` says the same thing in `pos/event-typed-fetch.ts`, and it is the
 * weaker claim: an index signature would satisfy a `keyof` assertion and still
 * hand a caller `event.$typedFetch.create(…)` typed as something. Two
 * diagnostics rather than two files, because they cannot mask each other — the
 * harness matches on code **plus** a message substring, and the substrings are
 * the two member names.
 *
 * Deliberately non-compiling; excluded from the package `tsconfig` and from
 * lint.
 */

import type { H3Event } from 'h3'
import type { Event$TypedFetch } from '../../../src/runtime/types'

/** Keeps the import used, which is what loads the `h3` augmentation. */
type _Surface = Event$TypedFetch

declare const event: H3Event

export const raw = event.$typedFetch.raw('/api/users/123')
export const created = event.$typedFetch.create({ baseURL: '/api' })
