import * as v from 'valibot'
import { z } from 'zod'

/** A route param, coerced from the string the path always carries. */
export const orderRef = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'order id must be a whole number')
    .transform(Number),
})

/** A page number, coerced from the string the query always carries. */
export const pagination = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'page must be a whole number')
    .transform(Number),
})

/** A sort direction from another library, composed beside `pagination`. */
export const sorting = v.object({
  sort: v.picklist(['asc', 'desc'], 'sort must be asc or desc'),
})
