import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'
import type { EventHandler } from 'h3'
import type { InternalApi } from 'nitropack/types'
import { authErrors } from '#shared/errors/auth'
import { userErrors } from '#shared/errors/user'
// The one place the playground reaches into the module package's own suite.
// `Equal` and `Expect` are fixed vocabulary and a second copy
// here could drift from the one every other assertion uses; the path is ugly,
// and that is the cheaper cost.
import type { Equal, Expect } from '../../../../test/types/vocabulary'

/**
 * The demoable route: two catalogues composed, one of them narrowed with
 * `.pick()`, three declared failures and a success type that infers from the
 * body with no annotation anywhere.
 */
const handler = defineTypedEventHandler(
  { errors: [userErrors, authErrors.pick('forbidden')] },
  async (event, { fail }) => {
    const id = getRouterParam(event, 'id')!

    if (id === 'missing') return fail('user-not-found', { userId: id })
    if (id === 'suspended')
      return fail('user-suspended', { until: '2026-12-31' })
    if (id === 'private') return fail('forbidden', { requiredRole: 'owner' })

    return { id, name: `User ${id}`, email: `${id}@example.com` }
  }
)

export default handler

// ---------------------------------------------------------------------------
// Layer 3
//
// These two assertions run against the **actually generated**
// `.nuxt/types/nitro-routes.d.ts`, so what they check is Nitro's real opinion
// of a branded route rather than a hand-written stand-in. They compile under
// `vue-tsc --project playground/tsconfig.json`, which is part of the package's
// `typecheck` script and therefore part of `pnpm check`. Layer 1 cannot make
// either claim: it has no generated file to read.
// ---------------------------------------------------------------------------

/**
 * **Nitro's own `InternalApi` entry for this route is untouched.**
 * Nitro computes it as `Simplify<Serialize<Awaited<ReturnType<…>>>>`
 * over the handler's *call signature*, while the declared union rides a sibling
 * property — disjoint positions, so nothing leaks. Vanilla
 * `useFetch('/api/users/1')` therefore still types `data` as exactly this.
 *
 * This is the spelling the claim was measured
 * in, made against the generated file rather than reproduced from it.
 */
type _routeStaysVanilla = Expect<
  Equal<
    InternalApi['/api/users/:id']['get'],
    { id: string; name: string; email: string }
  >
>

/**
 * The route is still an ordinary event handler, so Nitro, the router and every
 * h3 utility keep treating it as one.
 */
const _routeIsAPlainEventHandler: EventHandler = handler

/**
 * **The generated map keys this route, and its entry is this route's own
 * declared union**.
 *
 * Two things are claimed at once and both need the real build. The *index*
 * claims the augmentation bound in the **server** program, which it reaches only
 * through `addTypeTemplate`'s `{ nitro: true }`: drop that flag and
 * `TypedApiErrors` stays the empty interface the package publishes, and
 * `vue-tsc --project playground/server/tsconfig.json` reports `TS2339` here
 * while the app project stays green. That is the measured mutation which proves
 * this line can fail. The *union* claims the emitter read the brand off this
 * very file: it is what
 * `Simplify<Serialize<ExtractErrorsSafe<typeof import('./[id].get')>>>`
 * evaluated to, with `until: string` arriving through `Serialize` rather than
 * being written anywhere.
 *
 * The complementary claim — that the entry is a real union and not TypeScript's
 * error type, which would satisfy this assertion vacuously — is made by the
 * exhaustive `switch` in `playground/app.vue` and by the rendering assertion in
 * `test/generated-map.test.ts`. Neither is expressible here.
 */
type _mapKeysThisRoute = Expect<
  Equal<
    TypedApiErrors['/api/users/:id']['get'],
    | { tag: 'user-not-found'; status: 404; userId: string }
    | { tag: 'user-suspended'; status: 403; until: string }
    | { tag: 'forbidden'; status: 403; requiredRole: 'admin' | 'owner' }
  >
>
