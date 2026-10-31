/**
 * A DELIBERATELY BROKEN fixture, compiled by `client-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to
 * let each diagnostic through so the suite can read it.
 */

import { matchError } from '../../../src/runtime/shared'
import { toTryResult } from '../../../src/runtime/shared/errors/try-result'
import type { RequestFailed } from '../../../src/runtime/types'

type Declared =
  | { _tag: 'order-not-found'; id: number }
  | { _tag: 'order-locked' }

export async function exhaustive(): Promise<void> {
  const { error } = await toTryResult<null, Declared>(() =>
    Promise.resolve(null)
  )

  if (error === undefined) return

  switch (error._tag) {
    case 'order-not-found':
    case 'request-failed':
      return
    default: {
      // The missing case: `order-locked` is left over.
      const unhandled: never = error
      return unhandled
    }
  }
}

declare const failure: Declared | RequestFailed

export function missingArm(): void {
  matchError(
    failure,
    {
      'order-not-found': () => {},
      'request-failed': () => {},
    },
    () => {}
  )
}

export function missingRequestFailed(): void {
  matchError(
    failure,
    {
      'order-not-found': () => {},
      'order-locked': () => {},
    },
    () => {}
  )
}

export function strayArm(): void {
  matchError(
    failure,
    {
      'order-not-found': () => {},
      'order-locked': () => {},
      'request-failed': () => {},
      'order-unknown': () => {},
    },
    () => {}
  )
}

export function noFallback(): void {
  matchError(failure, {
    'order-not-found': () => {},
    'order-locked': () => {},
    'request-failed': () => {},
  })
}
