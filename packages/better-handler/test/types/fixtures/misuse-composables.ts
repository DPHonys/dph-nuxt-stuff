/**
 * A DELIBERATELY BROKEN fixture, compiled by `composables-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to
 * let each diagnostic through so the suite can read it.
 */

import type { UseBetterAsyncData } from '../../../src/runtime/types/composables'
import type { TryResult } from '../../../src/runtime/types/errors/client'

declare const useBetterAsyncData: UseBetterAsyncData

/** A `.try` call's result, as `$betterFetch.try` resolves one. */
declare function tried(): Promise<TryResult<{ id: number }, never>>

/** A call whose result nothing types, as an untyped fetch's. */
declare function untyped(): Promise<any>

/** A call resolving plain data, as a fetch without `.try` does. */
declare function fetched(): Promise<{ id: number }>

export function accepted(): { id: number } | undefined {
  const keyed = useBetterAsyncData('keyed', () => tried())
  // A handler that names its parameters is still read before its result.
  const named = useBetterAsyncData('named', (nuxtApp) => {
    void nuxtApp

    return tried()
  })

  return keyed.data.value ?? named.data.value
}

export function forgotTry(): void {
  useBetterAsyncData('plain', () => fetched())
}

export function resolvedAny(): void {
  useBetterAsyncData('untyped', () => untyped())
}

export function resolvedAnyKeyless(): void {
  useBetterAsyncData(() => untyped())
}
