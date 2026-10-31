import { unref } from 'vue'
import type { MaybeRef } from 'vue'
import type {
  MatchableError,
  MatchError,
  RequestFailed,
  UnknownTagFallback,
} from '../../types/errors/client'
import type { TaggedError } from '../../types/errors/tagged'
import { taggedOf } from './tagged'
import { classifyFailure } from './try-result'

/** The arms as the one runtime signature reads them: keyed by any tag. */
type AnyArms = Readonly<Partial<Record<string, (variant: never) => void>>>

// A `.try` error is already a variant, a plain object with its `_tag`; a
// fetched `NuxtError` goes through the classifier `.try` itself uses.
function variantOf(failure: MatchableError): TaggedError | RequestFailed {
  return taggedOf(failure) ?? classifyFailure(failure)
}

function dispatch(
  error: MaybeRef<MatchableError | null | undefined>,
  arms: AnyArms,
  fallback: UnknownTagFallback
): void {
  const failure = unref(error)
  if (failure === null || failure === undefined) return

  const variant = variantOf(failure)

  // Own keys only: a tag such as `toString` must not reach the arms object's
  // prototype and be called as an arm.
  const arm = Object.hasOwn(arms, variant._tag) ? arms[variant._tag] : undefined

  if (arm === undefined) {
    fallback(variant)
    return
  }

  // SAFETY: the arm was looked up by this variant's own `_tag`, and
  // `ErrorArms` types the arm for each tag with exactly the variant carrying
  // it, so the variant is the one value the arm is declared to take.
  arm(variant as never)
}

/**
 * Handle a failure by its `_tag`: one arm for each variant it can be - the
 * route's Known errors and the Request-failed variant - and a fallback for a
 * tag no arm names, such as one a newer server sends after a deploy. A
 * missing arm is a compile error. A nullish error is no failure, and nothing
 * is called. A ref is read once, when called; the reactive form is
 * `watch(error, () => matchError(error, …))`.
 *
 * ```ts
 * const { error } = await $betterFetch.try('/api/orders/7')
 *
 * matchError(
 *   error,
 *   {
 *     'order-not-found': ({ id }) => notFound(id),
 *     'order-locked': () => retryLater(),
 *     'request-failed': ({ status }) => offline(status),
 *   },
 *   (unknown) => report(unknown._tag)
 * )
 * ```
 *
 * It takes a `.try` error as it is, and a fetched `NuxtError` - an error ref,
 * a caught error - through the classifier `.try` uses.
 */
export const matchError: MatchError = dispatch
