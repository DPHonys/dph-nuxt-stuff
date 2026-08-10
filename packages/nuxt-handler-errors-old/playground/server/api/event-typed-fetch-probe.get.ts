import { declaredError } from '@dphonys/nuxt-handler-errors-old/shared'
import { describeUserFailure } from '#shared/lookup-probe'

/**
 * `event.$typedFetch` inside a Nitro handler, **with the global
 * beside it as the control**.
 *
 * The global `$typedFetch` already works verbatim in a handler — that is
 * `./typed-fetch-probe.get.ts`. So the *only* thing
 * this surface adds is context forwarding, and the only honest way to assert it
 * is to make both calls to the same callee in the same request and compare. The
 * `context` field below is that comparison, and it is why this probe returns
 * two strings where one would do.
 *
 * Four things are observable here and nowhere else:
 *
 * 1. **The forwarded context** — cookie, header and platform binding — against
 *    the global's answer for the identical call.
 * 2. **`.safe` answers the false arm with the callee's flat variant**, handed
 *    to `describeUserFailure`, whose parameter is
 *    `DeclaredErrorsOf<'/api/users/:id'>` and whose `switch` is exhaustive. The
 *    shape floor is not assignable to that parameter, so a degraded union is a
 *    compile error rather than a silent pass. This is the blessed
 *    server-to-server shape.
 * 3. **An undeclared callee still throws.** `/api/boom` is a hand-rolled 403
 *    with `data` of its own and no marker.
 * 4. **The header merge reaches the wire** on a route outside `/api/**`, which
 *    is the only place `accept` decides whether a declared failure comes back
 *    as JSON at all — and it is the *flattening* merge, which
 *    the global's correct one would break here.
 *
 * **The explicit return annotation is required, and it is Nitro's own
 * `InternalApi` cycle rather than anything this module introduced**: a
 * handler whose return type is inferred from a fetch call needs `InternalApi`
 * to type the call and needs the call to type its own `InternalApi` entry.
 * Measured on this app without it: `TS2321 Excessive stack depth` in
 * `MatchedRoutes`' scoring conditional.
 */
interface EventTypedFetchProbe {
  context: string
  global: string
  declared: string
  undeclared: string
  headers: string
}

/**
 * One `/api/context-echo` answer, rendered for comparison.
 *
 * **It is `render`'s parameter and nothing else, and that is load-bearing.**
 * `/api/context-echo` is a route this app really serves, so Nitro types both
 * calls below out of `InternalApi` and neither a type argument nor a variable
 * annotation would add anything — but a variable annotation *costs*
 * something. Measured on this app: writing
 * `const forwarded: Echo = await event.$typedFetch('/api/context-echo')` gives
 * **twelve `TS2321 Excessive stack depth`**, one per `InternalApi` key, in
 * `MatchedRoutes`' scoring conditional. The contextual type keeps `R`
 * unresolved through `NitroFetchOptions<R>`'s
 * `Uppercase<AvailableRouterMethod<R>>`, which is the `TS2321` stack-depth
 * trap arriving from a third direction. Left un-annotated the literal resolves
 * first and the whole file is clean.
 *
 * Passing the result to a function whose parameter is this interface makes the
 * same claim — the day the callee's response changes, this file is a compile
 * error rather than a silently wrong string — from the one position that does
 * not pay for it.
 */
interface Echo {
  cookie: string
  header: string
  accept: string
  middleware: string
  platform: string
}

function render(echo: Echo): string {
  return [
    echo.cookie,
    echo.header,
    echo.accept,
    echo.middleware,
    echo.platform,
  ].join('/')
}

export default defineEventHandler(
  async (event): Promise<EventTypedFetchProbe> => {
    // **`_platform` and not a plain key, and that is measured.**
    // h3 hands the caller's whole `event.context` to
    // the callee as the fetch init's `context`, `node-mock-http` parks it on
    // the inner request as `__unenv__`, and Nitro's `onRequest` then reads
    // exactly two things out of it: `_platform`, which it merges into the
    // callee's own context, and `waitUntil` (`app.mjs:48-59`). So a plain
    // `event.context.probeToken = …` here comes back `none` — mutation run —
    // while the platform binding arrives. This is the honest version of
    // *"cookies + context forwarded"*.
    event.context._platform = { probeToken: 'from-outer' }

    const forwarded = await event.$typedFetch('/api/context-echo')
    // The same call through the global, which forwards nothing. Its answer is
    // what `event.$typedFetch` exists to be different from.
    const unforwarded = await $typedFetch('/api/context-echo')

    const user = await event.$typedFetch.safe('/api/users/suspended')

    const boom = await event.$typedFetch.safe('/api/boom').then(
      () => 'did not throw',
      // Both halves matter: that it threw at all, and that what it threw was
      // *not* a declared failure.
      (thrown: unknown) =>
        declaredError(thrown) === undefined
          ? 'threw undeclared'
          : 'threw declared'
    )

    // `x-probe` is deliberately a header the **incoming** request also carries,
    // with a different value. h3 forwards the incoming one, and this call's own
    // is spread over it — so `from-caller` coming back says the caller's header
    // both survived the merge and won, while `kept` says it was dropped and the
    // forwarded one showed through. A header the outer request did not carry
    // could not tell those two apart.
    const status = await event.$typedFetch.safe('/status', {
      headers: new Headers({ 'x-probe': 'from-caller' }),
    })

    return {
      context: render(forwarded),
      global: render(unforwarded),
      declared: user.ok ? 'did not fail' : describeUserFailure(user.error),
      undeclared: boom,
      headers: status.ok
        ? 'did not fail'
        : `${status.error.accept}/${status.error.probe}`,
    }
  }
)
