import * as v from 'valibot'
import { z } from 'zod'

/** A page number, coerced from the string the wire always carries. */
export const pagination = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'page must be a whole number')
    .transform(Number),
})

/** A sort direction, from a second Standard Schema library. */
export const sorting = v.object({
  sort: v.picklist(['asc', 'desc'], 'sort must be asc or desc'),
})
