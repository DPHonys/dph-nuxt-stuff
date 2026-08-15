import * as v from 'valibot'
import { z } from 'zod'

/**
 * Reusable schema sets, declared once and spread into the routes that need
 * them. `defineValidation` arrives by auto-import here, as the wrapper does in
 * the routes.
 *
 * One set is named and one is not, and they are written with **different**
 * Standard Schema libraries - mixing them inside one declaration is the
 * package's headline claim, and this is where it survives a real build.
 */

/**
 * Named: its output nests under `pagination`, in every source it declares.
 * Namespacing is output-only, so the client still sends a flat `?page=`, and a
 * failing issue's `path` is `["page"]` - never `["pagination", "page"]`.
 */
export const pagination = defineValidation('pagination', {
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/, 'page must be a whole number')
      .transform(Number),
  }),
})

/** Unnamed: its outputs land flat, beside whatever else declared the source. */
export const sorting = defineValidation({
  query: v.object({
    sort: v.picklist(['asc', 'desc'], 'sort must be asc or desc'),
  }),
})
