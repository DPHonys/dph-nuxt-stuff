import { schema } from './schema'

/**
 * An output schema whose output a client receives through JSON: the `Date`
 * arrives as a string. Imported by its route and by the fetch-family checks,
 * which pin the fetched result to it.
 */
export const reportOutput = schema<unknown, { total: number; at: Date }>()
