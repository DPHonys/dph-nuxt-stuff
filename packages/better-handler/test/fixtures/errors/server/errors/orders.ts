import { z } from 'zod'
import { defineError } from '../../../../../src/runtime/server'

/** A declaration shared between routes, reused by spread. */
export const orderNotFound = defineError('order-not-found', {
  status: 404,
  schema: z.object({ id: z.number() }),
})
