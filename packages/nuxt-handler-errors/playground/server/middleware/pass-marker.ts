/**
 * A one-line marker proving an internal call is a **full app pass**
 * (SPEC.md §3.6).
 *
 * `event.$typedFetch` reaches h3's `fetchWithEvent`, which runs the request
 * through Nitro's own node listener rather than short-circuiting to a handler —
 * so middleware, the router and the error handler all run, and the body the
 * caller reads is the same serialized body a real HTTP client would get. That
 * is the reason SPEC.md §3.6 needs **no second wire format**: there is no path
 * on which a declared failure arrives as an unserialized thrown object, so
 * ticket 09's reader is the whole read.
 *
 * `/api/context-echo` reports whether this ran, which is how that claim is
 * measured rather than assumed.
 */
export default defineEventHandler((event) => {
  event.context.passMarker = true
})
