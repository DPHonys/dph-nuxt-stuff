import { createError } from 'h3'
import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { orderNotFound } from '../errors/orders'

/** A hand-rolled h3 error with `data` of its own, on a route that declares errors. */
export default defineBetterEventHandler({ errors: orderNotFound }, () => {
  throw createError({ statusCode: 403, data: { reason: 'hand-rolled' } })
})
