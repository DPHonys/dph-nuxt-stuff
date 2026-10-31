import { createError, defineEventHandler } from 'h3'

/** A failure no route declares: the Request-failed variant's to carry. */
export default defineEventHandler(() => {
  throw createError({ statusCode: 503, message: 'down for maintenance' })
})
