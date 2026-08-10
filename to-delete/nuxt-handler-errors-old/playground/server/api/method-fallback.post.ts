/**
 * The **unbranded, method-specific** half of the method-resolution divergence
 * case.
 *
 * It sits beside `./method-fallback.ts`, which *is* branded and is keyed
 * `default`. That pairing is the whole point: `/api/method-fallback` ends up
 * with `{ default: <a real union>, post: never }`, and this file is where the
 * `never` comes from.
 *
 * The three rows it makes assertable are in `./method-fallback.ts`, next to the
 * union they resolve to.
 */
export default defineEventHandler(() => ({ handledBy: 'post' as const }))
