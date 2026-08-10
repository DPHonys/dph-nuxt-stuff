import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors-old/server'
import { chainErrors } from '~~/server/errors/chain'

/**
 * Hop 2 of 3 — the middle of the A→B→C chain, and the one that shows
 * **both** shapes a caller may take with a callee's failure.
 *
 * - `mode=remap` — the ordinary branch. B raises its **own** variant,
 *   `b-upstream`, carrying whatever of C's payload it chose to keep. This is
 *   the shape the module blesses, and it needs no API: it is `if (!r.ok)` and a
 *   `fail`.
 * - `mode=forward` — verbatim forwarding, which *"already works with zero new
 *   API"*: B imported the same catalogue and **declared** `c-gone` in its own
 *   `errors: [...]`. That declaration is the act of publication — without it,
 *   `fail('c-gone', …)` is `TS2345`, which is why accidental leakage is
 *   unrepresentable rather than merely discouraged.
 *
 * A `fail.forward(r.error)` helper was rejected for exactly this reason
 *: it can only type-check once the caller has already declared
 * the tag, so it is sugar over the two lines below — and it would quietly
 * encourage the one shape the design asks callers to be deliberate about.
 *
 * **The explicit return annotation is required** and it is Nitro's own
 * `InternalApi` cycle, not this module's: a handler whose return
 * type is inferred from a fetch call needs `InternalApi` to type the call and
 * needs the call to type its own `InternalApi` entry. Every hop here is
 * annotated for that reason.
 */
export default defineTypedEventHandler(
  { errors: [chainErrors.pick('b-upstream', 'c-gone')] },
  async (event, { fail }): Promise<{ hop: 'b'; from: 'c'; cookie: string }> => {
    const mode = String(getQuery(event).mode ?? 'ok')
    const result = await event.$typedFetch.safe(`/api/chain/c?mode=${mode}`)

    if (!result.ok) {
      // One `case` and no `default`, and that is the assertion: C declares
      // exactly one variant, so an error union that had degraded to
      // the shape floor or to TypeScript's error type would leave
      // this `switch` non-exhaustive and the annotated return unsatisfied.
      switch (result.error.tag) {
        case 'c-gone':
          return mode === 'forward'
            ? fail('c-gone', {
                resource: result.error.resource,
                cookie: result.error.cookie,
              })
            : fail('b-upstream', {
                from: result.error.resource,
                cookie: result.error.cookie,
              })
      }
    }

    return { hop: 'b', from: result.data.hop, cookie: result.data.cookie }
  }
)
