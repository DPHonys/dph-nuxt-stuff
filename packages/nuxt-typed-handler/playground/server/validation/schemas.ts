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

/** A route param, coerced from the string the path always carries. */
export const orderRef = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'order id must be a whole number')
    .transform(Number),
})

/** The body the status-map route's `200` promises: a draft that existed. */
export const draftRef = z.object({ id: z.string() })

/** The body its `201` promises: the draft it had to create, and when. */
export const draftCreated = z.object({
  id: z.string(),
  createdAt: z.string(),
})

/** Which of the three declared statuses the status-map route should answer. */
export const draftIntent = z.object({
  answer: z.enum(['found', 'created', 'discarded']),
})
