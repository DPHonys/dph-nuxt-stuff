/**
 * The `#app` double, wired in by `vitest.config.ts`'s alias.
 *
 * `src/runtime/app/**` is app-side code: it imports `useFetch` from `#app`, an
 * alias that exists only inside a Nuxt build. This stands in for the functions
 * those files import, and records what the wrapper handed them — which is
 * precisely the boundary the header merge is a claim about.
 *
 * It is not a simulation of `useFetch` and must not become one. The composable
 * running for real, against a real server, is the e2e tier.
 *
 * `defineNuxtPlugin` is here for the same reason with even less to it: what the
 * client plugin's test asserts is the setup function's own effect, so the
 * double hands that function back unchanged and simulates nothing of Nuxt's
 * plugin lifecycle.
 */

import type { CheckedFetch } from '../../src/runtime/types'

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
 * One recorded `useAsyncData` call, kept whole and variadic: unlike `useFetch`,
 * vanilla decides which argument is the handler by inspecting all of them, and
 * the wrapper's claim is about that same split.
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
type RequestEvent = { $checkedFetch: CheckedFetch } | undefined

let requestEvent: RequestEvent

export function setRequestEvent(event: RequestEvent): void {
  requestEvent = event
}

export const useRequestEvent = (): RequestEvent => requestEvent
