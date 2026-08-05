/**
 * The fixture antagonist for SPEC.md §3.6's thunk claim (`test/wire.test.ts`).
 *
 * Replaces `event.$fetch` in its own `request` hook — standing in for any
 * third-party Nitro plugin that does the same. **The ordering is the point**:
 * scanned `server/plugins` are pushed after the module's `addServerPlugin`
 * entries (nitropack 2.13.4 `scanAndSyncOptions`, `core/index.mjs:855-860`)
 * and `request` hooks fire in registration order, so this replacement lands
 * *after* `event.$typedFetch` was installed. Only a wrapper that reads
 * `event.$fetch` at call time can pick it up — a hook-time capture never sees
 * it, which is exactly the mutation the wire test makes red.
 *
 * The replacement delegates to the function it replaced and stamps one marker
 * header, so every other wire observation is untouched;
 * `/api/fetch-replacer-echo` is the only route that reads the marker. The
 * `Headers`-then-flatten shuffle keeps whatever header shape the caller
 * passed intact (the module's own wrapper hands over a plain object —
 * SPEC.md §3.8's flatten — but bare `event.$fetch` callers may not).
 *
 * `RawFetch` reduces `event.$fetch` to the shape this file touches, for the
 * module's own reason (`RawEventFetch` in its server runtime): calling through
 * the real `$Fetch` generic with a wide request type is the `TS2321` stack
 * -depth trap (SPEC-AMENDMENTS item 33) — measured here on the stock-compiler
 * row before this spelling. The width also drops `$Fetch`'s `.raw` and
 * `.create` from the replacement, which nothing in this app calls off the
 * event; the thunk claim is about the call signature.
 */
interface RawInit {
  headers?: HeadersInit
}

type RawFetch = (request: unknown, init?: RawInit) => Promise<unknown>

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const original = event.$fetch as unknown as RawFetch

    const replaced: RawFetch = async (request, init) => {
      const headers = new Headers(init?.headers)
      headers.set('x-fetch-replaced', 'by-fixture')

      return original(request, {
        ...init,
        headers: Object.fromEntries(headers),
      })
    }

    event.$fetch = replaced as unknown as typeof event.$fetch
  })
})
