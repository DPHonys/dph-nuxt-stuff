import type { StandardSchemaV1 } from '@standard-schema/spec'

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
 * The handler's second parameter: exactly the declared sources, each typed as
 * its schema's *output* (`SuccessResult.value` is `InferOutput`), so coercions
 * and transforms land in the handler already applied.
 *
 * Mapping over `keyof S` - the inferred literal type, not the constraint - is
 * what makes undeclared sources vanish instead of arriving as `unknown` or as
 * optional keys.
 *
 * `Exclude<S[K], undefined>` runs *before* the `infer Schema extends
 * StandardSchemaV1` conditional and is load-bearing: options reaching the
 * wrapper through a widened `ValidateSchemas` annotation carry the
 * constraint's `| undefined` on every source, and without the strip each one
 * degrades to `never` rather than to `unknown` - the honest floor. Options
 * inferred from a literal are unaffected either way.
 */
export type ValidatedContext<S extends ValidateSchemas> = {
  [K in keyof S]-?: Exclude<S[K], undefined> extends infer Schema extends
    StandardSchemaV1
    ? StandardSchemaV1.InferOutput<Schema>
    : never
}
