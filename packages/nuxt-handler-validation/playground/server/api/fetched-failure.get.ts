import { recognizeValidationError } from '@dphonys/nuxt-handler-validation/server'

interface Rejection {
  data?: {
    issues?: unknown
    data?: { issues?: unknown }
  }
}

/**
 * A validation failure fetched from another route: its payload sits at
 * `err.data.data.issues` - ofetch's `FetchError.data` is the whole Nitro body,
 * and this package's payload is that body's own `data`.
 */
export default defineEventHandler(async () => {
  const thrown: unknown = await $fetch('/api/search?page=nope').then(
    () => undefined,
    (error: unknown) => error
  )

  const rejection = thrown as Rejection | undefined

  return {
    rejected: thrown !== undefined,
    atDataIssues: rejection?.data?.issues ?? null,
    atDataDataIssues: rejection?.data?.data?.issues ?? null,
    // The marker is non-enumerable and never serialized, so a failure that
    // crossed a wire is not recognized.
    recognized: recognizeValidationError(thrown) !== undefined,
  }
})
