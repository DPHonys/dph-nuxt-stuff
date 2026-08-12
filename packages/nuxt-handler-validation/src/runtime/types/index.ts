import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
} from 'h3'

/**
 * The type-only entry. Nothing here may carry a runtime value: a component
 * annotating a caught failure imports from `@dphonys/nuxt-handler-validation/types`
 * and must not drag h3 into the client bundle.
 */

/**
 * The four v1 sources, declared in the settled fail-fast order
 * (routerParams -> query -> headers -> body). Names follow h3's vocabulary:
 * `getValidatedRouterParams` / `getValidatedQuery` / `readValidatedBody`.
 * Three of them match h3 v2's `validate: { body, headers, query }` keys; there
 * is no route-params key there - validated route params are this package's own
 * differentiator, per the platform posture.
 *
 * Every key is optional and all four are mixable in one declaration.
 */
export interface ValidateSchemas {
  routerParams?: StandardSchemaV1
  query?: StandardSchemaV1
  headers?: StandardSchemaV1
  body?: StandardSchemaV1
}

/**
 * `'routerParams' | 'query' | 'headers' | 'body'` - derived rather than spelled
 * again, so the source list has exactly one definition.
 */
export type ValidationSource = keyof ValidateSchemas

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
