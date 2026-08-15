import { recognizeValidationError } from '@dphonys/nuxt-handler-validation-old/server'

/** Only what this route reaches for on a rejection - nothing is assumed present. */
interface Rejection {
  data?: {
    issues?: unknown
    data?: { issues?: unknown }
  }
}

/**
 * A validation failure **fetched from another route**, reported from where the
 * catching code actually finds it.
 *
 * This is the fact an aggregator should inherit rather than re-derive: a
 * fetched failure's payload sits at `err.data.data.issues`. Both `data`s are
 * the framework's - ofetch's `FetchError.data` is the whole Nitro body, and
 * this package's payload is that body's own `data`.
 */
export default defineEventHandler(async () => {
  const thrown: unknown = await $fetch('/api/search?page=nope').then(
    () => undefined,
    (error: unknown) => error
  )

  const rejection = thrown as Rejection | undefined

  return {
    rejected: thrown !== undefined,
    // Where the payload is *not*: one `data` short.
    atDataIssues: rejection?.data?.issues ?? null,
    // Where it is.
    atDataDataIssues: rejection?.data?.data?.issues ?? null,
    // The marker is non-enumerable and never serialized, so a failure that
    // crossed a wire is not recognized. That is exactly what the predicate
    // promises: raised in **this process**, never arrived over a fetch.
    recognized: recognizeValidationError(thrown) !== undefined,
  }
})
