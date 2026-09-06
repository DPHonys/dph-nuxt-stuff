import { recognizeValidationError } from '@dphonys/nuxt-handler-validation/server'
import * as v from 'valibot'

/** An issue as it reads back off the wire, loosely: only its presence matters. */
const ISSUES = v.array(v.looseObject({}))

/** The two depths a client might look at, parsed off whatever was thrown. */
const REJECTION = v.looseObject({
  data: v.optional(
    v.looseObject({
      issues: v.optional(ISSUES),
      data: v.optional(v.looseObject({ issues: v.optional(ISSUES) })),
    })
  ),
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

  const parsed = v.safeParse(REJECTION, thrown)
  const rejection = parsed.success ? parsed.output : undefined

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
