// The `@dphonys/better-handler/types` entry: the public types, and the
// interfaces the generated type map augments.

export type {
  ErrorDeclarationError,
  ErrorDeclarations,
  ErrorEntry,
  ErrorStatus,
  ReservedTag,
} from './errors/declaration'
export type { Fail, FailedError } from './errors/fail'
export type { TaggedError } from './errors/tagged'
export type {
  BetterEventHandler,
  BetterHandlerFn,
  BetterHandlerOptions,
  HandlerContext,
} from './handler'
