import type { ValidationSource } from '../types'

/**
 * The four sources in the order they validate - the promise that a bad route
 * param means the body is never read. `satisfies` refuses a name that is not a
 * source; the readers keyed off this tuple refuse a source left out.
 */
export const VALIDATION_SOURCES = [
  'routerParams',
  'query',
  'headers',
  'body',
] as const satisfies readonly ValidationSource[]
