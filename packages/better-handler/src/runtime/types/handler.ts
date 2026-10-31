import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import type {
  ErrorDeclarations,
  ErrorDeclarationsGuard,
} from './errors/declaration'
import type { Fail } from './errors/fail'
import type { KnownErrorsOf } from './errors/tagged'
import type { InputGuard } from './io/guard'
import type {
  DeclaredSource,
  HasInput,
  InputDeclaration,
  SourceValue,
  ValidationFailed,
} from './io/input'
import type { IsAny } from './utils'

/** Whether a route's `errors` declares at least one tag. */
type HasErrors<Errors> = [keyof Errors] extends [never] ? false : true

/**
 * A rule the declaration as a whole broke. Nothing the author writes can
 * satisfy it, so the diagnostic prints at the options with this sentence
 * inside it.
 */
export interface HandlerDeclarationError<Msg extends string> {
  readonly 'handler-declaration-error': Msg
}

/**
 * `unknown`, the identity of `&`, when the route declares a source or a tag;
 * the unsatisfiable property otherwise. An empty `input` or `errors` declares
 * nothing, as it validates and raises nothing.
 */
type DeclareSomething<Input, Errors> =
  HasInput<Input> extends true
    ? unknown
    : HasErrors<Errors> extends true
      ? unknown
      : HandlerDeclarationError<'declare input, errors, or both'>

/**
 * What a route declares to `defineBetterEventHandler`: its `input`, the
 * schemas per Validation source, and its `errors`, the Error declarations
 * keyed by tag. Each is optional; a route declares at least one.
 */
export type BetterHandlerOptions<
  Input extends InputDeclaration,
  Errors extends ErrorDeclarations,
> = DeclareSomething<Input, Errors> & {
  readonly input?: Input & InputGuard<Input>
  readonly errors?: Errors & ErrorDeclarationsGuard<Errors>
}

/** `'fail'` when the route declares a tag, and no key at all otherwise. */
type FailKey<Errors> = HasErrors<Errors> extends true ? 'fail' : never

/**
 * The Handler context: the Handler's second parameter, flat, and a fresh
 * object per request. It holds one key per declared Validation source, that
 * source's validated value, and the Fail helper when the route declares
 * `errors`. What a route does not declare is absent, not `undefined`.
 */
// One mapped type rather than an intersection: an intersection prints as its
// first member in a diagnostic, so a Handler reading a key it never declared
// would be told about a helper alias instead of the context it was handed.
export type HandlerContext<
  Input extends InputDeclaration,
  Errors extends ErrorDeclarations,
> = {
  readonly [Key in DeclaredSource<Input> | FailKey<Errors>]: Key extends 'fail'
    ? Fail<Errors>
    : Key extends keyof Input
      ? SourceValue<Input[Key]>
      : never
}

/**
 * The function a route hands `defineBetterEventHandler`. Its `event` is h3's
 * own, with default generics, so `readBody(event)` inside it is typed as h3
 * types it and nothing is claimed about the request it was not checked for.
 */
export type BetterHandlerFn<
  Input extends InputDeclaration,
  Errors extends ErrorDeclarations,
  Response,
> = (event: H3Event, context: HandlerContext<Input, Errors>) => Response

/**
 * Every Known error a route can fail with: the variants its `errors`
 * declares, and the Built-in validation-failed variant exactly when it
 * declares `input`.
 */
export type RouteKnownErrors<Input, Errors> =
  | KnownErrorsOf<Errors>
  | (HasInput<Input> extends true ? ValidationFailed : never)

// Module-private and never exported, so only this package can brand a
// Handler: a structural key on a foreign handler cannot spoof either slot,
// and no app code can read or write them.
declare const knownErrors: unique symbol
declare const requestInput: unique symbol

/**
 * The Handler `defineBetterEventHandler` returns: an h3 handler, answering
 * with what the route's function returns once it settles, and carrying the
 * route's Known errors and its Request input in phantom slots. The slots are
 * never assigned at runtime; they exist so the generated type map can read,
 * from the Handler's type alone, what the route can fail with and what a
 * client must send it.
 */
export interface BetterEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Errors = never,
  Input = never,
> extends EventHandler<Request, Response> {
  readonly [knownErrors]?: Errors
  readonly [requestInput]?: Input
}

/**
 * The Known errors a branded Handler carries, or `never` for `any` and for any
 * handler this package did not produce.
 */
// `IsAny` first, because `any` matches the slot with `Errors = unknown`; the
// `unknown` guard and `Exclude` because a handler without the slot still
// matches it, being optional, with nothing or `undefined` to infer.
export type KnownErrorsOfHandler<Handler> =
  IsAny<Handler> extends true
    ? never
    : Handler extends { readonly [knownErrors]?: infer Errors }
      ? unknown extends Errors
        ? never
        : Exclude<Errors, undefined>
      : never

/**
 * The Request input a branded Handler carries, or `never` for `any` and for
 * any handler this package did not produce. A branded route declaring no
 * source carries `{}`: it accepts nothing in particular.
 */
// Guarded exactly as `KnownErrorsOfHandler` is, for the same reasons.
export type RequestInputOfHandler<Handler> =
  IsAny<Handler> extends true
    ? never
    : Handler extends { readonly [requestInput]?: infer Input }
      ? unknown extends Input
        ? never
        : Exclude<Input, undefined>
      : never
