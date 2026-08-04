import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/shared'
import { chainErrors } from '#shared/errors/chain'

/**
 * Hop 3 of 3 — the deepest callee (SPEC.md §6.6).
 *
 * It declares one variant and knows nothing about the two routes above it.
 * `cookie` is read off **this** request, which is the whole point: this handler
 * is reached only through two nested `event.$typedFetch` calls, so a value here
 * that is not `none` is the outermost request's cookie having survived both
 * hops.
 */
export default defineTypedEventHandler(
  { errors: [chainErrors.pick('c-gone')] },
  (event, { fail }): { hop: 'c'; cookie: string } => {
    const cookie = getCookie(event, 'probe') ?? 'none'
    const mode = String(getQuery(event).mode ?? 'ok')

    if (mode !== 'ok') return fail('c-gone', { resource: mode, cookie })

    return { hop: 'c', cookie }
  }
)
