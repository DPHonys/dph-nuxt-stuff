import { declaredError } from '@dphonys/nuxt-handler-errors/shared'
import type {
  DeclaredErrorBody,
  DeclaredErrorsOf,
} from '@dphonys/nuxt-handler-errors/types'
import { describeUserFailure } from './lookup-probe'

/**
 * The reader, called from a consumer's `shared/` directory — the context
 * SPEC.md §3.7 puts the value form on the side-agnostic specifier *for*, and
 * the one server-to-server remapping lives in (SPEC.md §3.6).
 *
 * This is layer 3 (SPEC.md §9.1): the union comes from the **really generated**
 * map rather than from a hand-written stand-in, and the error type is assembled
 * from the published `/types` specifier rather than from `#app`, because `#app`
 * does not exist in this directory. `test/types/pos/reader.ts` makes the same
 * claims hermetically against a replica of Nuxt's own `NuxtError`.
 *
 * **No line here writes the wire key**, which is the whole reason the reader
 * exists (SPEC.md §3.7): the honest address is three property hops ending on a
 * key SPEC.md §5.2 froze as renameable protocol.
 */

/**
 * What a typed client holds for `/api/users/:id`.
 *
 * Spelled with the route path alone — the lookup does the rest. Ticket 10's
 * `useTypedFetch` produces exactly this inside a `NuxtError`; until it lands,
 * naming the shape here is what proves the reader can consume it.
 */
interface UserRouteError {
  data?: DeclaredErrorBody<DeclaredErrorsOf<'/api/users/:id'>>
}

/**
 * **The hand-off is the assertion.**
 *
 * `describeUserFailure` takes `DeclaredErrorsOf<'/api/users/:id'>` and narrows
 * it exhaustively, so passing the reader's answer straight into it claims two
 * things at once: that the first overload matched, and that what came back is
 * this route's declared union rather than SPEC.md §5.3's floor —
 * `AnyVariant` is not assignable to that parameter. Measured: making the first
 * overload answer the floor turns the hand-off below into `TS2345`.
 *
 * Delegating rather than repeating the `switch` is deliberate. The
 * exhaustiveness — a `switch` with no `default` in a function promising a
 * `string` — is stated once, in `./lookup-probe`, where it is also the assertion
 * that the emitted map still means something (SPEC-AMENDMENTS item 9). A second
 * copy here would drift from it and claim nothing extra.
 *
 * The early return is SPEC.md §3.7 consequence 2 in one line: `undefined` *is*
 * "not a declared failure", and reaching it costs the caller no narrowing tax
 * on the ordinary error channel.
 */
export function describeReadFailure(error: UserRouteError | undefined): string {
  const failure = declaredError(error)

  if (failure === undefined) return 'not a declared failure'

  return describeUserFailure(failure)
}
