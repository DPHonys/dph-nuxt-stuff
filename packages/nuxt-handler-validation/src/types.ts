/**
 * The validation type surface, moved out of `@dphonys/nuxt-handler-errors`
 * when the feature was parked (see this package's README).
 *
 * Everything here is the type-level half of what core's SPEC.md §3.3 designed:
 * the inlined Standard Schema interface, the normalised issue shape, the two
 * guards, and the definer signature that layers schemas onto the core
 * `defineTypedEventHandler` without core knowing about them.
 */

import type {
  AnyCatalogue,
  ConflictGuard,
  TypedEventHandler,
  TypedHandlerContext,
  UnionOfCatalogues,
} from '@dphonys/nuxt-handler-errors/types'
import type { EventHandlerRequest, EventHandlerResponse, H3Event } from 'h3'

// ---------------------------------------------------------------------------
// Standard Schema (core SPEC.md §3.3)
// ---------------------------------------------------------------------------

/**
 * Standard Schema v1, **inlined** rather than depended on.
 *
 * Fifty-odd lines of interface, exactly as h3 v2 inlines them, and the whole
 * reason this package keeps zero runtime dependencies for its validation
 * surface: zod, valibot, arktype and anything else that implements the spec
 * works untouched, and none of them is named here.
 *
 * The one member the adapter calls is `validate`, and it is declared returning
 * `Result<Output> | Promise<Result<Output>>` — **the promise arm is there even
 * for a synchronous schema**, which is why the adapter always awaits.
 *
 * `SuccessResult.issues` is declared `?: undefined` on purpose: that is what
 * makes `result.issues === undefined` narrow the union, so the adapter needs no
 * cast to tell success from failure.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaProps<Input, Output>
}

/** See {@link StandardSchemaV1}. */
interface StandardSchemaProps<Input, Output> {
  readonly version: 1
  readonly vendor: string
  readonly validate: (
    value: unknown
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>
  readonly types?: StandardSchemaTypes<Input, Output> | undefined
}

/** See {@link StandardSchemaV1}. */
type StandardSchemaResult<Output> =
  | StandardSchemaSuccessResult<Output>
  | StandardSchemaFailureResult

/** See {@link StandardSchemaV1}. */
interface StandardSchemaSuccessResult<Output> {
  readonly value: Output
  readonly issues?: undefined
}

/** See {@link StandardSchemaV1}. */
interface StandardSchemaFailureResult {
  readonly issues: readonly StandardSchemaIssue[]
}

/**
 * The spec's own issue, and the reason {@link ValidationIssue} exists.
 *
 * `path` is `ReadonlyArray<PropertyKey | PathSegment>` and `PropertyKey`
 * includes `symbol`, so through Nitro's `Serialize` this becomes
 * `(string | number | { readonly key: string | number } | null)[]` — four arms
 * and a null, on the surface a client narrows every failure through.
 * Re-exporting it was **never** available; normalisation is mandatory rather
 * than preferred.
 */
interface StandardSchemaIssue {
  readonly message: string
  readonly path?:
    | ReadonlyArray<PropertyKey | StandardSchemaPathSegment>
    | undefined
}

/** See {@link StandardSchemaIssue}. */
interface StandardSchemaPathSegment {
  readonly key: PropertyKey
}

/** See {@link StandardSchemaV1}. */
interface StandardSchemaTypes<Input, Output> {
  readonly input: Input
  readonly output: Output
}

/**
 * A schema's parsed output — what the handler receives, already typed.
 *
 * The spec's own `InferOutput`, spelled out: the schema parks its types on an
 * optional `types` property that carries no runtime value, and `NonNullable`
 * is what reads through the `| undefined` the spec declares it with.
 */
export type InferSchemaOutput<S extends StandardSchemaV1> = NonNullable<
  S['~standard']['types']
>['output']

// ---------------------------------------------------------------------------
// The normalised issue
// ---------------------------------------------------------------------------

/**
 * Where an input came from.
 *
 * **`headers` is deliberately absent**, and that is an explicit rejection
 * rather than an omission: h3 offers no analogue, header contracts are a
 * middleware or gateway concern, and every header value is a string. This union
 * is **closed** and it is published inside a payload, so adding a fourth member
 * later widens a wire type every consumer has already narrowed on.
 */
export type ValidationLocation = 'body' | 'query' | 'params'

/**
 * One normalised validation issue.
 *
 * **This is a named `interface` and that is a rendering mandate, not a
 * preference** (core SPEC.md §8.3(c)): Nitro's `Simplify` short-circuits on
 * arrays, so an array-valued payload field keeps its `Serialize` residue in
 * every hover, and the only thing that decides legibility is whether the
 * element type has a name to render.
 *
 * `path` is a **segment array, not a dotted string**: lossless when a key
 * contains a `.`, and `issue.path.join('.')` at the call site is free. A
 * whole-value issue — "expected an object, received a string" — has `path: []`.
 * Symbol keys, which the spec admits and JSON does not, are normalised to their
 * `String(…)` form, so this array is exactly what survives the wire.
 */
export interface ValidationIssue {
  location: ValidationLocation
  path: (string | number)[]
  message: string
}

/**
 * The tag of the variant this package raises for a validation failure.
 *
 * The package ships one plain catalogue under this tag, `invalidInput`, at
 * status 400. It is an **ordinary** catalogue — it composes, it is subject to
 * the duplicate-tag guard, it has `.pick()` — and it is **never implicitly
 * present**: a route that declares schemas and does not list it still
 * validates and still fails, unmarked.
 *
 * The status is genuinely swappable because the definer resolves the tag
 * against the *composed catalogues at runtime*: an app standardising on 422
 * declares its own catalogue with this tag and lists that instead.
 */
export type ValidationTag = 'invalid-input'

/** Exactly what this package can put in an `invalid-input` payload. */
interface ValidationFill {
  issues: ValidationIssue[]
}

/** The payload fields of every `invalid-input` variant a composition declares. */
type DeclaredValidationPayload<C extends readonly AnyCatalogue[]> = Omit<
  Extract<UnionOfCatalogues<C>, { tag: ValidationTag }>,
  'tag' | 'status'
>

/**
 * The declared payload fields this package has no value for.
 *
 * A mapped type per field, so the offending field's name is what lands in the
 * diagnostic rather than a verdict on the payload as a whole. `-?` is what lets
 * an *optional* field pass — the package not filling it is then the author's
 * own declaration.
 */
type UnfillableValidationFields<P> = {
  [K in keyof P]-?: ValidationFill extends Pick<P, K> ? never : K
}[keyof P]

/**
 * Makes an `invalid-input` variant this package cannot fill a compile error
 * naming the field.
 *
 * **Guard-first, for the same measured reason core's `ConflictGuard` is** —
 * TypeScript truncates the tail of a rendered type, so guard-last buries the
 * field name. The check is deliberately unconditional on whether a schema was
 * declared: a catalogue listing this tag is a promise that *this package*
 * raises it, so the shape has to be one the package can produce whether or not
 * the route validates anything today.
 */
export type ValidationShapeGuard<C extends readonly AnyCatalogue[]> = [
  Extract<UnionOfCatalogues<C>, { tag: ValidationTag }>,
] extends [never]
  ? // No variant with the tag: nothing to fill, and `{}` is the identity
    // element for `&`.
    // eslint-disable-next-line ts/no-empty-object-type
    {}
  : [UnfillableValidationFields<DeclaredValidationPayload<C>>] extends [never]
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : {
        __invalidValidationPayload__: `The \`${ValidationTag}\` variant declares a payload this module cannot fill: ${UnfillableValidationFields<DeclaredValidationPayload<C>> & string}`
      }

// ---------------------------------------------------------------------------
// The handler context
// ---------------------------------------------------------------------------

/**
 * One parsed input property, present **only** when its location is declared.
 *
 * Absent is `{}` rather than an optional property, which is what makes
 * destructuring an undeclared location `TS2339` at compile time instead of
 * `undefined` at run time.
 */
type InputProperty<Location extends string, S> = [S] extends [undefined]
  ? // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      [K in Location]: S extends StandardSchemaV1 ? InferSchemaOutput<S> : never
    }

/**
 * The parsed inputs a validated handler receives — **eagerly and flat**,
 * per core SPEC.md §3.3.
 *
 * Lazy accessors (`await input.body()`) were rejected: they would let the
 * author order auth before validation, but a handler that never calls one
 * publishes a failure it can never emit. Eager delivery is also what makes
 * "every declared location is validated, and one response reports everything
 * wrong at once" true by construction.
 */
export type ValidatedInputs<Body, Query, Params> = InputProperty<'body', Body> &
  InputProperty<'query', Query> &
  InputProperty<'params', Params>

/**
 * A validated handler body. The success type infers from it with no
 * annotation, exactly as core's `TypedHandlerFn` does — the three schema
 * parameters default to `undefined`, which {@link ValidatedInputs} reads as
 * *"this location was not declared"*.
 */
export type ValidatedHandlerFn<
  Request extends EventHandlerRequest,
  Response,
  C extends readonly AnyCatalogue[],
  Body = undefined,
  Query = undefined,
  Params = undefined,
> = (
  event: H3Event<Request>,
  ctx: TypedHandlerContext<UnionOfCatalogues<C>> &
    ValidatedInputs<Body, Query, Params>
) => Response

/**
 * The validated declaration surface: core's `defineTypedEventHandler` options
 * object plus `body`/`query`/`params`, layered without core knowing.
 *
 * **`Response` has no default type parameter**, for the same reason core's
 * definer has none: an explicit type argument is an arity error rather than a
 * silent collapse of the success type to `any`.
 *
 * Two of h3's live footguns are unrepresentable here, and the second is
 * inverted: `body: CreateUser.safeParse` — h3's own JSDoc-recommended spelling,
 * which there *silently disables validation* — has no `~standard` and is a
 * compile error, while `body: CreateUser`, the raw schema object h3 crashes
 * on, is the correct argument. There is deliberately no
 * plain-`(v: unknown) => T` escape hatch: accepting one reopens that hole
 * verbatim, since a `safeParse` reference is exactly that shape.
 */
export interface DefineValidatedEventHandler {
  <
    const C extends readonly AnyCatalogue[],
    Response extends EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
    Body extends StandardSchemaV1 | undefined = undefined,
    Query extends StandardSchemaV1 | undefined = undefined,
    Params extends StandardSchemaV1 | undefined = undefined,
  >(
    options: ConflictGuard<C> &
      ValidationShapeGuard<C> & {
        errors: C
        body?: Body
        query?: Query
        params?: Params
      },
    handler: ValidatedHandlerFn<Request, Response, C, Body, Query, Params>
  ): TypedEventHandler<Request, Response, UnionOfCatalogues<C>>
}
