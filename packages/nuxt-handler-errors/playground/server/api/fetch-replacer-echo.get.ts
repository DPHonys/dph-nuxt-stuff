/**
 * What arrived at a callee, restricted to the fixture replacer's one marker
 * header (SPEC.md §3.6's thunk claim, asserted in `test/wire.test.ts`).
 *
 * Called through `event.$typedFetch` from `/api/fetch-replacer-probe`, the
 * marker reports whether the internal hop went through the `event.$fetch`
 * replacement that `server/plugins/fetch-replacer.ts` installs *after* the
 * module's own `request` hook. Called directly over HTTP it reports `absent` —
 * no internal hop happened, so nothing stamped it — which is the control.
 *
 * Deliberately a plain `defineEventHandler`, for the same reason as
 * `./context-echo.get.ts`: the claim is about hook composition, not the
 * declared channel, and an undeclared callee keeps this route out of every
 * union assertion elsewhere.
 */
interface FetchReplacerEcho {
  marker: string
}

export default defineEventHandler(
  (event): FetchReplacerEcho => ({
    marker: getRequestHeader(event, 'x-fetch-replaced') ?? 'absent',
  })
)
