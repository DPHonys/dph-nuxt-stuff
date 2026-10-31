import { schema } from './schema'

/**
 * An output schema whose input a client receives through JSON: the `Date`
 * arrives as a string. Imported by its route and by the fetch-family checks,
 * which pin the fetched result to it.
 */
export const reportOutput = schema<
  { total: number; at: Date },
  { total: number; at: Date }
>()
