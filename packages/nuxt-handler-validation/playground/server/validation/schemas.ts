import * as v from 'valibot'
import { z } from 'zod'

/** A page number, coerced from the string the wire always carries. */
export const pagination = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'page must be a whole number')
    .transform(Number)
    // A long enough digit string passes the regex and coerces to `Infinity`,
    // so the coerced value is checked as well as the string it came from.
    .refine(Number.isSafeInteger, 'page is out of range'),
})

/** A sort direction, from a second Standard Schema library. */
export const sorting = v.object({
  sort: v.picklist(['asc', 'desc'], 'sort must be asc or desc'),
})
