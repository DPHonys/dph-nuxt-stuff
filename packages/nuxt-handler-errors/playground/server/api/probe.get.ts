import { matchError } from '@dphonys/nuxt-handler-errors/shared'

/**
 * The server surfaces in one response: the event-bound instance, the global,
 * and the matcher over both a declared failure and an undeclared one.
 */
export default defineEventHandler(async (event) => {
  let declared = 'no failure'

  const suspended = await event.$checkedFetch.try('/api/users/suspended')

  if (suspended.error) {
    matchError(
      suspended.error,
      {
        userNotFound: (e) => (declared = `userNotFound: ${e.userId}`),
        userSuspended: (e) => (declared = `userSuspended until ${e.until}`),
        forbidden: (e) => (declared = `forbidden, needs ${e.requiredRole}`),
        rateLimited: (e) => (declared = `rateLimited for ${e.retryAfter}s`),
      },
      (err, unrecognized) =>
        (declared = unrecognized
          ? `unrecognized: ${unrecognized.tag}`
          : `unknown: ${err.status ?? 0}`)
    )
  }

  let undeclared = 'no failure'

  const boom = await event.$checkedFetch.try('/api/boom')

  if (boom.error) {
    matchError(
      boom.error,
      {},
      (err, unrecognized) =>
        (undeclared = unrecognized
          ? `unrecognized: ${unrecognized.tag}`
          : `unknown: ${err.status ?? 0}`)
    )
  }

  // Context forwarding is the only thing the event-bound member adds over the
  // global, so both make the same call in the same request.
  const viaEvent = await event.$checkedFetch.try('/api/chain/c')
  const viaGlobal = await $checkedFetch.try('/api/chain/c')

  return {
    declared,
    undeclared,
    cookieViaEvent: viaEvent.data?.cookie ?? 'none',
    cookieViaGlobal: viaGlobal.data?.cookie ?? 'none',
  }
})
