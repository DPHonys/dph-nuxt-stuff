/**
 * What a client receives from this app's output routes, read through Nuxt's
 * own typed `$fetch`: the type the returned Handler answers with. Compiler-
 * asserted: `pnpm typecheck` runs `vue-tsc` over this project.
 */

/** Restated rather than imported: an app has no business in a test tree. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

// What `$fetch` resolves to for each route and method, as a call site sees
// it: the call's own type, instantiated without making a request.
type Receipt = Awaited<ReturnType<typeof $fetch<unknown, '/api/receipts/7'>>>

type Health = Awaited<ReturnType<typeof $fetch<unknown, '/api/health'>>>

type Created = Awaited<
  ReturnType<typeof $fetch<unknown, '/api/receipts', { method: 'POST' }>>
>

/** The bare form answers its schema's output type, nothing the Handler added. */
export type BareHolds = Assert<
  Equal<Receipt, { id: number; total: number; at: string }>
>

/** An output-only route is typed the same way. */
export type OutputOnlyHolds = Assert<Equal<Health, { ok: true; at: string }>>

/**
 * A status map answers the union of its bodies, `null` for the bodiless
 * status, never the Respond helper's result that carried them.
 */
export type MapHolds = Assert<
  Equal<Created, { id: number; total: number; at: string } | null>
>
