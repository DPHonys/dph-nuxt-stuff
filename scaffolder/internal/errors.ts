export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export function isNotFound(cause: unknown): boolean {
  return isNodeError(cause) && cause.code === 'ENOENT'
}

export function isAlreadyExists(cause: unknown): boolean {
  return isNodeError(cause) && cause.code === 'EEXIST'
}

/** Wraps a non-Error rejection so the outcome always carries an Error. */
export function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause), { cause })
}
