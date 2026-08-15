import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import type {
  MergedContext,
  MergedSchemaMap,
  NameMarker,
  ValidationFragment,
  ValidationGroup,
} from './composition'
import type { NotAGroup, OnlyValidationSources } from './guard'
import type { ValidateSchemas, ValidatedContext } from './schemas'
import type { IsAny } from './utils'

/**
 * The returned handler is a plain h3 `EventHandler<Request, Response>` - the
 * type Nitro's route map reads - so a validated handler flows into Nitro's
 * typed routes exactly as `defineEventHandler`'s result does.
 *
 * `__validatedSchemas__` is a phantom: it exists only in the type, costs zero
 * runtime, and is the aggregator seam's record of what a route declared.
 * `Schemas` is unconstrained and defaults to `never` - sibling parity, and the
 * default is half of the answer `SchemasOfHandler` gives for a handler that
 * declared nothing.
 */
export interface ValidatedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Schemas = never,
> extends EventHandler<Request, Response> {
  __validatedSchemas__?: Schemas
}

/**
 * Recover a route's declared schemas from its handler type - the supported
 * door onto the phantom; nobody reaches into the dunder property. `never`
 * means "declared none", which is what `Schemas`' default settles.
 *
 * `IsAny` is load-bearing: without it an `any`-typed handler takes both
 * branches and the result is `unknown`, no longer the "declares nothing"
 * sentinel and enough to send a downstream `S extends { query: infer Q }` down
 * the wrong branch. `Exclude<..., undefined>` is sibling parity and costs
 * nothing - a handler with no phantom already yields `never`, because
 * `{ __validatedSchemas__?: infer S }` is a weak type that h3's `EventHandler`
 * shares no property with.
 */
export type SchemasOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { __validatedSchemas__?: infer S }
      ? Exclude<S, undefined>
      : never

/**
 * The wrapper's two forms: an array of composed fragments, and the flat schema
 * object a route declaring its own schemas writes inline.
 *
 * The array overload is declared first. That is legible rather than
 * load-bearing - `ValidateSchemas` is a weak type, so a group shares no
 * property with it and can never match the flat overload wherever it sits -
 * but the intent is worth showing in the order.
 *
 * Both parameters carry the source-key guard, in the two shapes `guard.ts`
 * gives its reasons for: mapped over the fragments on the array overload,
 * intersected with `NotAGroup` on the flat one.
 */
// `Response` has no default type parameter on purpose (the sibling's rule, and
// stated here on the *define* signature rather than on the handler type): an
// explicit type argument becomes an arity error instead of silently collapsing
// the success type to `any`.
export interface DefineValidatedEventHandler {
  <
    const F extends readonly ValidationFragment[],
    Response extends EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: { [I in keyof F]: F[I] & OnlyValidationSources<F[I]> },
    handler: (event: H3Event<Request>, validated: MergedContext<F>) => Response
  ): ValidatedEventHandler<Request, Response, MergedSchemaMap<F>>
  <
    S extends ValidateSchemas,
    Response extends EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: S & OnlyValidationSources<S> & NotAGroup,
    handler: (
      event: H3Event<Request>,
      validated: ValidatedContext<S>
    ) => Response
  ): ValidatedEventHandler<Request, Response, S>
}

/**
 * The definer for a reusable schema set, in its two arities: unnamed, whose
 * outputs stay flat in each source, and named, whose outputs nest under the
 * name in **every** source the set declares.
 *
 * `const` is what keeps each schema's exact type - and so each source's exact
 * output - reaching every route that spreads the group. On the name it is what
 * keeps the literal, without which every set would namespace under `string`.
 *
 * Both arities carry the source-key guard, and this is the best place to meet
 * it: arity overloads have nothing to collapse, so a stray key reports at the
 * offending property, once, in the file that declares the set - rather than at
 * every route that spreads it.
 */
export interface DefineValidation {
  <const S extends ValidateSchemas>(
    schemas: S & OnlyValidationSources<S>
  ): ValidationGroup<S>
  <const Name extends string, const S extends ValidateSchemas>(
    name: Name,
    schemas: S & OnlyValidationSources<S>
  ): ValidationGroup<NameMarker<Name> & S>
}
