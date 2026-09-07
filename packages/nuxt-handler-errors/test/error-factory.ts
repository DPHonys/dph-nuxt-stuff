/**
 * The runtime face of a handler's error factories, for the arity and payload
 * checks the typed face would refuse at compile time.
 */

import type { ErrorFactory } from '../src/runtime/server/lib/error-context'

/** The factory built under `name`; the test fails if it is missing. */
export function factory(
  errors: Record<string, ErrorFactory>,
  name: string
): ErrorFactory {
  const found = errors[name]

  if (found === undefined) throw new Error(`no factory named ${name}`)

  return found
}
