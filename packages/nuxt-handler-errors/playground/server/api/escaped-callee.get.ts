/**
 * SPEC.md §6.5's escaped-callee path, as a route so it can be *run*.
 *
 * This handler calls another handler's declared failure server-to-server and
 * **does not catch it**. Everything interesting happens after that:
 *
 * - `toNodeListener` sets `unhandled = true` whenever the thrown value is not
 *   an `H3Error`, and ofetch's `FetchError` is not one;
 * - Nitro's production serializer applies `isSensitive = unhandled || fatal`
 *   and **wipes `data` entirely**, masking `message` to `"Server Error"`;
 * - `statusMessage` is *not* gated by `isSensitive`, and it still carries the
 *   callee's tag — the one field that leaks.
 *
 * So the declared failure degrades to an undeclared one, which is the safe
 * direction and is free: the reader answers `undefined`, and even unmasked the
 * envelope would sit one hop deeper than the reader reads. SPEC.md §6.5's
 * guidance is *prefer `.safe()` server-to-server*, and this route is the
 * measurement behind it rather than an endorsement of the shape.
 *
 * Declared nothing itself, on purpose: a plain `defineEventHandler`, so the
 * route is keyed in the generated map and extracts to `never` like any other
 * undeclared route (SPEC.md §4.2, §6.1).
 *
 * **The explicit return annotation is required, and it is SPEC.md §6.6's cycle
 * rather than anything this module introduced.** A handler whose return type is
 * inferred from a `$fetch` call needs `InternalApi` to type the call, and needs
 * the call to type its own `InternalApi` entry. Measured here without the
 * annotation, against `playground/tsconfig.json`: six `TS2321 Excessive stack
 * depth` in `MatchedRoutes`' scoring conditional — SPEC.md §10.1's exact
 * failure, in vanilla Nitro types, at a plain `defineEventHandler`. Annotating
 * the return cuts the edge, which is what a real app has to do too.
 */
export default defineEventHandler(async (): Promise<{ reached: true }> => {
  await $fetch('/api/users/missing')

  return { reached: true }
})
