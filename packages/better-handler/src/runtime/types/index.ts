// The `@dphonys/better-handler/types` entry: the public types, and the
// interfaces the generated type map augments.

import type { RouteMethod } from './engine'
import type { $BetterFetch, BetterFetch } from './fetch'
import type { RouteEntry } from './utils'

export type {
  AsyncDataErrorOf,
  AsyncDataHandlerError,
  BetterAsyncDataHandler,
  FailureOf,
  SuccessOf,
  TrySource,
  UseBetterAsyncData,
  UseBetterFetch,
  UseBetterFetchOptions,
  UseRequestBetterFetch,
} from './composables'
export type {
  ErrorArms,
  KnownErrorBody,
  KnownErrorFor,
  KnownErrorOf,
  MatchableError,
  MatchError,
  RequestFailed,
  TryResult,
  UnknownTagFallback,
  VariantsOf,
} from './errors/client'
export type {
  ErrorDeclarationError,
  ErrorDeclarations,
  ErrorEntry,
  ErrorStatus,
  ReservedTag,
} from './errors/declaration'
export type { Fail, FailedError } from './errors/fail'
export type { KnownErrorsOf, TaggedError } from './errors/tagged'
export type { Wire } from './engine'
export type {
  $BetterFetch,
  BetterFetch,
  BetterFetchError,
  BetterFetchTry,
  BetterRequestOptions,
} from './fetch'
export type {
  BetterEventHandler,
  BetterHandlerFn,
  BetterHandlerOptions,
  HandlerContext,
  HandlerDeclarationError,
  KnownErrorsOfHandler,
  RequestInputOfHandler,
  ResponseOutputOfHandler,
  RouteKnownErrors,
} from './handler'
export type { InputDeclarationError, InputGuard } from './io/guard'
export type {
  InputDeclaration,
  InputOf,
  MergedInput,
  MergedOutput,
  OutputOf,
  RequestInput,
  SourceInput,
  SourceSchemas,
  SourceValue,
  ValidatedContext,
  ValidationFailed,
  ValidationIssue,
  ValidationSource,
} from './io/input'
export type {
  HandlerReturn,
  Respond,
  Responded,
  ResponseBodies,
  ResponseOutput,
  ResponseOutputs,
  SentResponse,
  StatusMap,
} from './io/output'

/**
 * The generated map of every route's Known errors - never written by hand.
 * Keyed by Nitro's route keys and lowercased methods; `nuxt prepare` and every
 * dev-server rebuild reopen it with `declare module`, and empty means no route
 * has declared anything yet.
 */
// Declared here rather than re-exported: the generated file augments this
// module by its specifier, and an augmentation reaches only an interface the
// module itself declares.
export interface KnownApiErrors {}

/**
 * The generated map of every route's Request input - never written by hand.
 * Keyed and reopened exactly as `KnownApiErrors` is, in the same generated
 * file: each value is what a client must send, every declared source as its
 * schemas' input type.
 */
// Declared here for the same reason `KnownApiErrors` is.
export interface KnownApiRequestInputs {}

/**
 * A route's Known errors from its request path and method alone; `never`
 * means the route declares none. The method may be named in either case.
 */
export type KnownErrorsOfRoute<
  Route extends string,
  Method extends RouteMethod | Uppercase<RouteMethod> = 'get',
> = Known<RouteEntry<KnownApiErrors, Route, Method>>

/**
 * A route's Request input from its request path and method alone: one key per
 * declared source, `{}` for a route of this package declaring none, and
 * `never` for a route this package does not type. The method may be named in
 * either case.
 */
export type RequestInputOfRoute<
  Route extends string,
  Method extends RouteMethod | Uppercase<RouteMethod> = 'get',
> = Known<RouteEntry<KnownApiRequestInputs, Route, Method>>

// The maps' extractors never answer `any` for a handler they can read, so an
// `any` entry is a handler module the compiler could not resolve - a
// JavaScript route a module ships without declarations, Nuxt's own renderer.
// Nothing is known of what it declares, so it declares nothing here, and the
// route stays as vanilla as Nitro's own types leave it. Boxed in tuples
// rather than `IsAny`: an unresolved import is the compiler's error type,
// which a conditional type over it answers with itself; boxed, it behaves as
// `any` does and is assignable to two different literals at once.
type Known<Entry> = [Entry] extends [never]
  ? never
  : [Entry] extends [0]
    ? [Entry] extends [1]
      ? never
      : Entry
    : Entry

declare module 'h3' {
  interface H3Event {
    /**
     * The fetch family bound to this request: `$betterFetch`'s call and
     * `.try`, forwarding the request's headers and cookies as `event.$fetch`
     * does.
     */
    $betterFetch: BetterFetch
  }
}

declare global {
  /**
   * The typed fetch global: callable in a Nitro handler, in `<script setup>`
   * and in an app's `shared/` directory with no import.
   */
  // eslint-disable-next-line vars-on-top -- an ambient global is declared with `var`
  var $betterFetch: $BetterFetch
}
