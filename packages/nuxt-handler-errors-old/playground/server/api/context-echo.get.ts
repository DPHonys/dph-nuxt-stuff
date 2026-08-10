/**
 * What a callee actually received.
 *
 * Every field is one thing `event.$typedFetch` is supposed to forward and
 * `globalThis.$typedFetch` is not, read off **this** request. Called directly it
 * reports what the HTTP client sent; called through `event.$typedFetch` from
 * `/api/event-typed-fetch-probe` it reports what survived the hop, and the two
 * are compared in `test/specifiers.test.ts`.
 *
 * Deliberately a plain `defineEventHandler`: the claim is about context, not
 * about the declared channel, and an undeclared callee keeps this route out of
 * every union assertion elsewhere.
 */
interface ContextEcho {
  /** Forwarded by h3's `getProxyRequestHeaders` — the headline of context forwarding. */
  cookie: string
  /** The same mechanism, for an ordinary request header. */
  header: string
  /**
   * The one header h3 lists in `ignoredHeaders` and therefore never forwards,
   * which is why this module sets it itself.
   */
  accept: string
  /** Whether the request went through the app's middleware — a full app pass. */
  middleware: string
  /**
   * `_platform` is the one part of the caller's `event.context` Nitro merges
   * into the callee's own context (`app.mjs:50-57`), which is how a per-request
   * platform binding survives an internal call.
   */
  platform: string
}

export default defineEventHandler((event): ContextEcho => {
  const platform: unknown = event.context.probeToken

  return {
    cookie: getCookie(event, 'probe') ?? 'none',
    header: getRequestHeader(event, 'x-probe') ?? 'none',
    accept: getRequestHeader(event, 'accept') ?? 'none',
    middleware: event.context.passMarker === true ? 'ran' : 'absent',
    platform: typeof platform === 'string' ? platform : 'none',
  }
})
