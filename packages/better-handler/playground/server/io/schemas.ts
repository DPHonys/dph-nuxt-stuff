import { z } from 'zod'

/** A page number, coerced from the string the query always carries. */
export const pagination = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'page must be a whole number')
    .transform(Number)
    // A long enough digit string passes the regex and coerces to `Infinity`,
    // so the coerced value is checked as well as the string it came from.
    .refine(Number.isSafeInteger, 'page is out of range'),
})

/** A sort direction, composed beside `pagination` on one source. */
export const sorting = z.object({
  sort: z.enum(['asc', 'desc'], 'sort must be asc or desc'),
})

/** A route param, coerced from the string the path always carries. */
export const invoiceRef = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'invoice id must be a whole number')
    .transform(Number)
    .refine(Number.isSafeInteger, 'invoice id is out of range'),
})

/** A receipt as the output routes send it: `at` an ISO string on the wire. */
export const receipt = z.object({
  id: z.number(),
  total: z.number(),
  at: z.iso.datetime(),
})

/** What a client posts to create a receipt. */
export const receiptDraft = z.object({ total: z.number().nonnegative() })
