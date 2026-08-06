import { declaredError } from '@dphonys/nuxt-handler-errors/shared'
import { describeUserFailure } from '#shared/lookup-probe'

/**
 * `$typedFetch` inside a Nitro handler, **with no import of it anywhere in this
 * file**.
 *
 * That is the whole point of declaring it the way Nitro declares its own
 * `$fetch`: a route file reaches the typed surface with no new entry point. The
 * name resolves because `./runtime/types` carries a `declare global` and the
 * emitted map imports that file into every program; the *value* is there
 * because the module registers a Nitro plugin that assigns it.
 *
 * Four things are observable here and nowhere else, and each is one line:
 *
 * 1. **`.safe` answers the false arm with the callee's flat variant.** Handing
 *    it to `describeUserFailure`, whose parameter is
 *    `DeclaredErrorsOf<'/api/users/:id'>` and whose `switch` is exhaustive, is
 *    what claims that — the shape floor is not assignable to that
 *    parameter, so a degraded union is a compile error rather than a silent
 *    pass. This is also the blessed server-to-server shape.
 * 2. **An undeclared route still throws.** `/api/boom` is a hand-rolled 403
 *    with `data` of its own and no marker, so `.safe` must rethrow it — its
 *    result type has already collapsed to the one-arm form, and `ok` there is
 *    the literal `true`.
 * 3. **The header merge reaches the wire.** `/status` echoes back the `accept`
 *    and `x-probe` headers it received, and it sits outside `/api/**`, which is
 *    the only place `accept` decides whether a declared failure comes back as
 *    JSON at all.
 * 4. **`create`'s defaults combine losslessly** with a per-call header, and the
 *    module's own `accept` is still added on top.
 *
 * **The explicit return annotation is required, and it is Nitro's own
 * `InternalApi` cycle rather than anything this module introduced**: a
 * handler whose return type is inferred from a fetch call needs `InternalApi`
 * to type the call and needs the call to type its own `InternalApi` entry.
 * Measured on this app without it: `TS2321 Excessive stack depth` in
 * `MatchedRoutes`' scoring conditional. Annotating the return cuts the edge,
 * which is what a real app has to do too — and `event.$typedFetch` writes
 * exactly this shape.
 */
interface TypedFetchProbe {
  declared: string
  undeclared: string
  headers: string
  instance: string
}

export default defineEventHandler(async (): Promise<TypedFetchProbe> => {
  const user = await $typedFetch.safe('/api/users/suspended')

  const boom = await $typedFetch.safe('/api/boom').then(
    () => 'did not throw',
    // Both halves matter: that it threw at all, and that what it threw was
    // *not* a declared failure. A `.safe` that quietly reported every failure
    // as declared would satisfy neither.
    (thrown: unknown) =>
      declaredError(thrown) === undefined
        ? 'threw undeclared'
        : 'threw declared'
  )

  const status = await $typedFetch.safe('/status', {
    headers: new Headers({ 'x-probe': 'kept' }),
  })

  const client = $typedFetch.create({ headers: { 'x-probe': 'from-instance' } })
  const created = await client.safe('/status')

  return {
    declared: user.ok ? 'did not fail' : describeUserFailure(user.error),
    undeclared: boom,
    headers: status.ok
      ? 'did not fail'
      : `${status.error.accept}/${status.error.probe}`,
    instance: created.ok
      ? 'did not fail'
      : `${created.error.accept}/${created.error.probe}`,
  }
})
