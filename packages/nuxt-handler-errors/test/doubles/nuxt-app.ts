/**
 * The `#app` double, wired in by `vitest.config.ts`'s alias - `#app` only
 * exists inside a Nuxt build. It records what the wrappers handed vanilla and
 * simulates nothing; the composables running for real is the e2e tier.
 */

import * as v from 'valibot'
import { shallowRef } from 'vue'
import type {
  VanillaFetchArgs,
  VanillaFetchResult,
} from '../../src/runtime/app/composables/fetch-wrapper'
import type {
  VanillaAsyncDataArg,
  VanillaAsyncDataResult,
} from '../../src/runtime/app/composables/use-checked-async-data'
import type { CheckedFetch } from '../../src/runtime/types'

/** One recorded call, split as vanilla's own runtime splits its three arguments. */
export interface RecordedCall {
  readonly name: 'useFetch' | 'useLazyFetch'
  readonly request: VanillaFetchArgs[0]
  readonly opts: Exclude<VanillaFetchArgs[1], string>
  readonly autoKey: string | undefined
}

export const calls: RecordedCall[] = []

// What the double hands back: the two refs a caller destructures, empty.
// The wrappers never read the result; the shape is vanilla's for the
// module layer that types the composable over it.
const emptyResult = (): Pick<VanillaFetchResult, 'data' | 'error'> => ({
  data: shallowRef(undefined),
  error: shallowRef(undefined),
})

function record(name: RecordedCall['name']) {
  return (...[request, arg1, arg2]: VanillaFetchArgs) => {
    const [opts, autoKey] = v.is(v.string(), arg1)
      ? [undefined, arg1]
      : [arg1, arg2]

    calls.push({ name, request, opts, autoKey })

    return emptyResult()
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
  readonly args: readonly VanillaAsyncDataArg[]
}

export const asyncDataCalls: RecordedAsyncDataCall[] = []

const emptyAsyncDataResult = (): Pick<
  VanillaAsyncDataResult,
  'data' | 'error'
> => ({
  data: shallowRef(undefined),
  error: shallowRef(undefined),
})

function recordAsyncData(name: RecordedAsyncDataCall['name']) {
  return (...args: readonly VanillaAsyncDataArg[]) => {
    asyncDataCalls.push({ name, args })

    return emptyAsyncDataResult()
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
