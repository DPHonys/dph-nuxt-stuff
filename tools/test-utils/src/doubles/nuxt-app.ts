/**
 * The `#app` double, wired in by each module's `vitest.config.ts` alias -
 * `#app` only exists inside a Nuxt build. It records what the wrappers handed
 * vanilla and simulates nothing; the composables running for real is the e2e
 * tier. Typed off vanilla's own signatures, so it serves every module that
 * wraps them.
 */

import type { H3Event } from 'h3'
import type {
  useAsyncData as vanillaUseAsyncData,
  useFetch as vanillaUseFetch,
} from 'nuxt/app'
import { shallowRef } from 'vue'
import { z } from 'zod'

type VanillaFetchArgs = Parameters<typeof vanillaUseFetch>
type VanillaAsyncDataArg = Parameters<typeof vanillaUseAsyncData>[number]

/** One recorded call, split as vanilla's own runtime splits its three arguments. */
export interface RecordedCall {
  readonly name: 'useFetch' | 'useLazyFetch'
  readonly request: VanillaFetchArgs[0]
  readonly opts: Exclude<VanillaFetchArgs[1], string>
  readonly autoKey: string | undefined
}

export const calls: RecordedCall[] = []

// What the double hands back: the two refs a caller destructures, empty.
// The wrappers never read the result; the shape is vanilla's for the module
// layer that types the composable over it, and the same for both families.
const emptyResult = () => ({
  data: shallowRef(undefined),
  error: shallowRef(undefined),
})

// A string in vanilla's second slot is the injected auto-key, not options.
const isKey = (arg: VanillaFetchArgs[1]): arg is string =>
  z.string().safeParse(arg).success

function record(name: RecordedCall['name']) {
  return (...[request, arg1, arg2]: VanillaFetchArgs) => {
    const [opts, autoKey] = isKey(arg1) ? [undefined, arg1] : [arg1, arg2]

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

function recordAsyncData(name: RecordedAsyncDataCall['name']) {
  return (...args: readonly VanillaAsyncDataArg[]) => {
    asyncDataCalls.push({ name, args })

    return emptyResult()
  }
}

export const useAsyncData = recordAsyncData('useAsyncData')
export const useLazyAsyncData = recordAsyncData('useLazyAsyncData')

export const defineNuxtPlugin = <T>(plugin: T): T => plugin

/**
 * What `useRequestEvent()` answers next; `undefined` is the no-request case.
 * Each module reads its own injected member off the event, so a suite hands
 * over just that slice.
 */
type RequestEvent = Partial<H3Event> | undefined

let requestEvent: RequestEvent

export function setRequestEvent(event: RequestEvent): void {
  requestEvent = event
}

export const useRequestEvent = (): RequestEvent => requestEvent
