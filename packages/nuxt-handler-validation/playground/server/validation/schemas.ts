import * as v from 'valibot'
import { z } from 'zod'

/**
 * Reusable validation units: **plain schema values**, exported and imported
 * like any other value. There is no definer and no set vocabulary - v2's whole
 * reuse story is this file.
 *
 * The two are written with **different** Standard Schema libraries, because
 * composing them inside one tuple is the package's headline claim and this is
 * where it survives a real build.
 *
 * Every schema here carries its **own** message, so the wire assertions pin
 * this app's contract rather than whichever wording a schema library ships this
 * week.
 */

/** A page number, coerced from the string the wire always carries. */
export const pagination = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'page must be a whole number')
    .transform(Number),
})

/** A sort direction, from the other library. */
export const sorting = v.object({
  sort: v.picklist(['asc', 'desc'], 'sort must be asc or desc'),
})
