// The `@dphonys/better-handler/types` entry: the public types, and the
// interfaces the generated type map augments.

import type { RouteMethod } from './engine'
import type { RouteEntry } from './utils'

export type {
  ErrorArms,
  KnownErrorBody,
  KnownErrorFor,
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
  OutputDeclarationError,
  OutputGuard,
  Respond,
  Responded,
  RespondError,
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
 * A route's Known errors from its request path and method alone; `never`
 * means the route declares none. The method may be named in either case.
 */
export type KnownErrorsOfRoute<
  Route extends string,
  Method extends RouteMethod | Uppercase<RouteMethod> = 'get',
> = RouteEntry<KnownApiErrors, Route, Method>
