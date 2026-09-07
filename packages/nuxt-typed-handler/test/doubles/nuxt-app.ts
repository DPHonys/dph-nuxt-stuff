/**
 * The `#app` double, wired in by `vitest.config.ts`'s alias - `#app` only
 * exists inside a Nuxt build. It records what the wrappers handed vanilla and
 * simulates nothing; the composables running for real is the e2e tier.
 */

import type { TrySource } from '@dphonys/nuxt-handler-errors/internals/app'
import type { NitroFetchRequest } from 'nitropack/types'
import type { MaybeRefOrGetter } from 'vue'
import type { TypedFetch } from '../../src/runtime/types'

/** The empty refs vanilla's double answers with; nothing reads them. */
interface AsyncDataDouble {
  readonly data: { value: undefined }
  readonly error: { value: undefined }
}

const EMPTY: AsyncDataDouble = {
  data: { value: undefined },
  error: { value: undefined },
}

/**
 * The options the wrapper hands vanilla: the caller's, with `headers` always
 * the merged computed. The one key a suite reads.
 */
export interface ForwardedFetchOptions {
  readonly headers?: MaybeRefOrGetter<HeadersInit>
}

/** One recorded call, in vanilla's own three-argument runtime shape. */
export interface RecordedCall {
  readonly name: 'useFetch' | 'useLazyFetch'
  readonly request: NitroFetchRequest
  readonly opts: ForwardedFetchOptions | undefined
  readonly autoKey: string | undefined
}

export const calls: RecordedCall[] = []

function record(name: RecordedCall['name']) {
  return (
    request: NitroFetchRequest,
    opts?: ForwardedFetchOptions,
    autoKey?: string
  ): AsyncDataDouble => {
    calls.push({ name, request, opts, autoKey })

    return EMPTY
  }
}

export const useFetch = record('useFetch')
export const useLazyFetch = record('useLazyFetch')

/**
 * One argument of vanilla `useAsyncData`'s runtime signature: a key, the
 * handler, the options, or the injected auto-key.
 */
export type VanillaAsyncDataArg =
  | MaybeRefOrGetter<string>
  | ((...rest: never[]) => Promise<TrySource>)
  | ForwardedFetchOptions
  | undefined

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
  return (...args: VanillaAsyncDataArg[]): AsyncDataDouble => {
    asyncDataCalls.push({ name, args })

    return EMPTY
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
