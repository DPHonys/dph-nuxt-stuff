import { matchError } from '@dphonys/nuxt-handler-errors/shared'

/**
 * Server-to-server, the blessed shape: `.try` plus translation arms. The arm
 * that knows a specific answer throws the caller's own failure; the trailing
 * generic throw is required because the compiler cannot know an arm throws.
 */
export default defineEventHandler(async (event) => {
  const mode = String(getQuery(event).mode ?? 'ok')

  const { data, error } = await event.$checkedFetch.try('/api/chain/c', {
    query: { mode },
  })

  if (error) {
    matchError(
      error,
      {
        'c-gone': (e) => {
          throw createError({
            statusCode: 410,
            message: `upstream gone: ${e.resource}`,
          })
        },
      },
      (err) => console.warn(`upstream failure: ${err.status ?? 0}`)
    )

    throw createError({ statusCode: 502, message: 'upstream failed' })
  }

  return { ok: data.ok, cookie: data.cookie }
})
