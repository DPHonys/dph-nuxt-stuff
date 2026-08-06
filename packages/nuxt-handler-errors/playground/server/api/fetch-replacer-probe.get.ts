/**
 * The thunk claim, from the caller's seat: `event.$typedFetch` must
 * reach the callee through whatever `event.$fetch` is **at call time**, not
 * whatever it was when the module's `request` hook installed the wrapper.
 *
 * `server/plugins/fetch-replacer.ts` replaces `event.$fetch` in a `request`
 * hook registered after the module's — scanned `server/plugins` are pushed
 * after `addServerPlugin`'s entries (nitropack 2.13.4 `scanAndSyncOptions`,
 * `core/index.mjs:855-860`), and `request` hooks fire in registration order —
 * so the replacement lands on an event whose `$typedFetch` already exists.
 * The marker coming back says the wrapper composed with a replacement it could
 * not have seen at install time; capturing `event.$fetch` at hook time instead
 * makes this hop bypass the replacement and the marker read `absent`
 * (mutation run, `test/wire.test.ts`).
 *
 * The explicit return annotation is Nitro's `InternalApi` cycle — see
 * `./event-typed-fetch-probe.get.ts`.
 */
interface FetchReplacerProbe {
  marker: string
}

/**
 * `relay`'s parameter and nothing else — the same contextual-typing position
 * `./event-typed-fetch-probe.get.ts` measures: any position that hands the
 * fetch call a contextual type (a variable annotation there, the argument
 * slot of an inlined call here — measured on the stock-compiler row) is the
 * `TS2321` stack-depth trap, so the result lands in
 * an un-annotated const first. The parameter still makes the claim that the
 * day the callee's response changes shape, this file is a compile error
 * rather than a silently wrong string.
 */
function relay(echo: FetchReplacerProbe): FetchReplacerProbe {
  return echo
}

export default defineEventHandler(
  async (event): Promise<FetchReplacerProbe> => {
    const echo = await event.$typedFetch('/api/fetch-replacer-echo')

    return relay(echo)
  }
)
