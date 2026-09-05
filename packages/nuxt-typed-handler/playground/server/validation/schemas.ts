import { z } from 'zod'

/** A page number, coerced from the string the wire always carries. */
export const pagination = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'page must be a whole number')
    .transform(Number),
})

/** What creating a user takes. */
export const createUser = z.object({
  name: z.string().min(1, 'name is required'),
  email: z.string().email('email must be an address'),
})

/** The second half of the search query, composed with `pagination` as a tuple. */
export const sorting = z.object({
  sort: z.enum(['name', 'created']).optional(),
})

/** What updating an item takes; the `default` handler's declared body. */
export const itemUpdate = z.object({
  qty: z.number(),
})
