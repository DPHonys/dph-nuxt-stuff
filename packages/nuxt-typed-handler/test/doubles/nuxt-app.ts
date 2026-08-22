/**
 * The `#app` double, wired in by `vitest.config.ts`'s alias - `#app` only
 * exists inside a Nuxt build. It records what the wrappers handed vanilla and
 * simulates nothing; the composables running for real is the e2e tier.
 */

import type { TypedFetch } from '../../src/runtime/types'

/** One recorded call, in vanilla's own three-argument runtime shape. */
export interface RecordedCall {
  readonly name: 'useFetch' | 'useLazyFetch'
  readonly request: unknown
  readonly opts: Record<string, unknown> | undefined
  readonly autoKey: unknown
}

export const calls: RecordedCall[] = []

function record(name: RecordedCall['name']) {
  return (request: unknown, arg1?: unknown, arg2?: unknown): unknown => {
    calls.push({
      name,
      request,
      opts: arg1 as Record<string, unknown> | undefined,
      autoKey: arg2,
    })

    return { data: { value: undefined }, error: { value: undefined } }
  }
}

export const useFetch = record('useFetch')
export const useLazyFetch = record('useLazyFetch')

/**
 * One recorded `useAsyncData` call, kept whole: vanilla decides which argument
 * is the handler by inspecting all of them.
 */
export interface RecordedAsyncDataCall {
  readonly name: 'useAsyncData' | 'useLazyAsyncData'
  readonly args: readonly unknown[]
}

export const asyncDataCalls: RecordedAsyncDataCall[] = []

function recordAsyncData(name: RecordedAsyncDataCall['name']) {
  return (...args: unknown[]): unknown => {
    asyncDataCalls.push({ name, args })

    return { data: { value: undefined }, error: { value: undefined } }
  }
}

export const useAsyncData = recordAsyncData('useAsyncData')
export const useLazyAsyncData = recordAsyncData('useLazyAsyncData')

export const defineNuxtPlugin = <T>(plugin: T): T => plugin

/** What `useRequestEvent()` answers next; `undefined` is the no-request case. */
type RequestEvent = { $typedFetch: TypedFetch } | undefined

let requestEvent: RequestEvent

export function setRequestEvent(event: RequestEvent): void {
  requestEvent = event
}

export const useRequestEvent = (): RequestEvent => requestEvent
