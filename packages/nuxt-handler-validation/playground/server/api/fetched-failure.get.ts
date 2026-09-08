import { recognizeValidationError } from '@dphonys/nuxt-handler-validation/server'
import { z } from 'zod'

/** An issue as it reads back off the wire, loosely: only its presence matters. */
const ISSUES = z.array(z.looseObject({}))

/** The two depths a client might look at, parsed off whatever was thrown. */
const REJECTION = z.looseObject({
  data: z
    .looseObject({
      issues: ISSUES.optional(),
      data: z.looseObject({ issues: ISSUES.optional() }).optional(),
    })
    .optional(),
})

/**
 * A validation failure fetched from another route: its payload sits at
 * `err.data.data.issues` - ofetch's `FetchError.data` is the whole Nitro body,
 * and this package's payload is that body's own `data`.
 */
export default defineEventHandler(async () => {
  const thrown: unknown = await $fetch('/api/search?page=nope').then(
    () => undefined,
    (error) => error
  )

  const rejection = REJECTION.safeParse(thrown).data

  return {
    rejected: thrown !== undefined,
    atDataIssues: rejection?.data?.issues ?? null,
    atDataDataIssues: rejection?.data?.data?.issues ?? null,
    // The marker is non-enumerable and never serialized, so a failure that
    // crossed a wire is not recognized - and only an `Error` could carry it.
    recognized:
      thrown instanceof Error && recognizeValidationError(thrown) !== undefined,
  }
})
