/**
 * The `@dphonys/nuxt-handler-errors/shared` entry point.
 *
 * Side-agnostic runtime values, reachable by hand-written import from the
 * client, the server and a consumer's `shared/` directory (SPEC.md §3). The
 * hand-writable specifier is the contract; auto-imports are additive sugar on
 * top of it, never a substitute — the bare `.` specifier is import-protected by
 * Nuxt in every context, which is why these subpaths are mandatory.
 *
 * ## Why the reactive reader is here too, and what it costs
 *
 * SPEC.md §3.7 puts the *value* reader "on `/shared`" and does not say where its
 * reactive sibling goes. There is nowhere else: SPEC.md §3 publishes exactly
 * three specifiers, `./types` is type-only, and `.` is the module entry, which
 * Nuxt's import protection blocks from app code — so `/shared` is the only
 * hand-writable home a composable can have, and SPEC.md §3.7 makes the
 * hand-writable specifier the contract with auto-imports as sugar on top.
 *
 * The cost is the `vue` import below. It is paid by every context that loads
 * this file, which in a Nuxt app is free — Vite and Nitro both already resolve
 * `vue`, the latter for the SSR renderer — and is why `vue` is a plain
 * catalog-ranged dependency for the same instance-identity reason SPEC.md §7.2
 * gives for `h3`: two physical copies of Vue mean two reactivity systems, and a
 * `computed` created in one does not track a ref owned by the other.
 */

import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParams,
  readBody,
} from 'h3'
import type { H3Event } from 'h3'
import { computed } from 'vue'
import type { Ref } from 'vue'
import type {
  AnyCatalogue,
  AnyVariant,
  DeclaredErrorReader,
  DefineErrors,
  DefinePayload,
  DefineTypedEventHandler,
  ErrorCatalogue,
  UseDeclaredError,
  ValidationIssue,
  ValidationLocation,
  ValidationTag,
  VariantDef,
} from './types'
import { hasDeclaredSchemas, validateDeclaredInput } from './validation'
import type { DeclaredSchemas } from './validation'

/**
 * The reserved key a declared failure travels under, inside the error body's
 * `data` (SPEC.md §5.2). Frozen wire protocol: it deliberately does not track
 * the package name, so renaming the package cannot silently break a client.
 *
 * Its presence *is* the evidence that the server declared this failure, and its
 * value *is* the variant. Versioning is by key rename, which is a feature — an
 * old client sees a marker it does not recognise and falls back to the
 * undeclared channel, the conservative direction, with no negotiation policy to
 * write.
 */
export const DECLARED_ERROR_KEY = '__declaredError__'

/**
 * Marks a variant's payload type. The runtime value is inert — only the type
 * argument matters.
 *
 * The type argument is checked against what survives JSON serialization; see
 * `SerializablePayload` for why that is a correctness requirement rather than
 * hygiene.
 */
export const payload: DefinePayload = () => ({})

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The guard, and the whole of SPEC.md §5.3's shape floor.
 *
 * **Presence of the marker is not enough.** The floor — a string `tag` and a
 * number `status` — is checked too, so a marker that is present but malformed
 * (a proxy rewriting bodies, a mangled response, a hand-rolled imitation) reads
 * as *undeclared* rather than as a malformed declared failure. That is the
 * conservative direction: an undeclared error is what every existing consumer
 * already knows how to handle, while a half-understood variant would narrow on
 * a `tag` whose payload is not there.
 *
 * Everything here is deliberately `typeof`-based rather than `in`-based.
 * `typeof marker === 'object'` rejects a function carrying `tag` and `status`
 * properties, and the explicit `!== null` is what stops `typeof null` — which is
 * `'object'` — from reaching the property reads. An array passes the `object`
 * test and then fails on `tag`, which is correct: an array is not a variant.
 *
 * The three property hops are the honest address (SPEC.md §5.2): ofetch defines
 * `FetchError.data` as a getter over the *whole* response body and `createError`
 * copies `input.data` wholesale, so the body's own `data` is the second hop.
 * Optional chaining covers a primitive, `null`, `undefined`, and a response
 * whose `data` Nitro stripped in production (SPEC.md §6.5).
 */
function readFloor(error: unknown): AnyVariant | undefined {
  const marker = (
    error as { data?: { data?: Record<string, unknown> } } | null | undefined
  )?.data?.data?.[DECLARED_ERROR_KEY]

  return typeof marker === 'object' &&
    marker !== null &&
    typeof (marker as AnyVariant).tag === 'string' &&
    typeof (marker as AnyVariant).status === 'number'
    ? (marker as AnyVariant)
    : undefined
}

/**
 * Read the declared variant out of an error value, or `undefined` if there is
 * not one (SPEC.md §3.7).
 *
 * ```ts
 * import { declaredError } from '@dphonys/nuxt-handler-errors/shared'
 *
 * const failure = declaredError(error)
 * if (failure) {
 *   switch (failure.tag) { … }
 * }
 * ```
 *
 * The overloads, what `undefined` means and what deploy skew does to the answer
 * are all documented on {@link DeclaredErrorReader}. The runtime behaviour is
 * one function for both: {@link readFloor} answers the floor, and the first
 * overload's `E` is a *static* claim about an error whose type already carried
 * the union — nothing at run time re-checks it, because nothing on the wire
 * could (SPEC.md §4.4, §6.2).
 *
 * The assertion is to the interface itself rather than through `never`: a
 * single implementation signature can never be *assignable* to an overloaded
 * type whose first member returns a type parameter, but it is still checked for
 * comparability against it, so a `readFloor` that stopped answering the floor
 * would fail here. `as never` would not.
 */
export const declaredError: DeclaredErrorReader =
  readFloor as DeclaredErrorReader

/**
 * The reactive sibling of {@link declaredError}, for templates
 * (SPEC.md §3.7).
 *
 * ```ts
 * const { error } = await useFetch('/api/users/42')
 * const failure = useDeclaredError(error)
 * const current = failure.value        // ← narrowing lands here
 * if (current) {
 *   switch (current.tag) { … }
 * }
 * ```
 *
 * See {@link UseDeclaredError} for why the local `const` is not a style
 * preference.
 */
export const useDeclaredError: UseDeclaredError = ((error: Ref<unknown>) =>
  computed(() => readFloor(error.value))) as UseDeclaredError

// ---------------------------------------------------------------------------
// Raising
// ---------------------------------------------------------------------------

/**
 * The one error-creation call at the raise site (SPEC.md §5.1). Nothing
 * intercepts it: no Nitro plugin, no error-handler override.
 *
 * Three details are load-bearing:
 *
 * - **`message` and `statusMessage` are both the tag.** Nitro substitutes
 *   `"Server Error"` for an unset `statusMessage`, so leaving it off makes every
 *   declared 403 report `Server Error` as its HTTP reason phrase. Tags are
 *   kebab-case ASCII, so h3's `sanitizeStatusMessage` leaves them alone.
 * - **`fatal` and `unhandled` are left alone**, so they stay `false` and the
 *   framework's existing "expected error" convention is adopted rather than
 *   replaced: the production serializer keeps `data`, and Nuxt never escalates
 *   a declared failure to the global error page.
 * - **The status is duplicated inside the marker, and that copy is
 *   authoritative.** h3 rewrites an out-of-range HTTP status to a default, so
 *   the two agree by construction rather than by hope (SPEC.md §5.3).
 *
 * The two reserved names are spread **last** so a payload field called `tag` or
 * `status` cannot displace them — which is what the type level already says,
 * since `{ tag: K } & P` intersects rather than overwrites.
 */
function raiseDeclared(
  tag: string,
  status: number,
  fields: Record<string, unknown>
): never {
  throw createError({
    statusCode: status,
    statusMessage: tag,
    message: tag,
    data: { [DECLARED_ERROR_KEY]: { ...fields, tag, status } },
  })
}

// ---------------------------------------------------------------------------
// Catalogues
// ---------------------------------------------------------------------------

/**
 * The runtime view of a catalogue — what `fail` reads to resolve a tag's
 * status.
 *
 * It is deliberately not part of `ErrorCatalogue`: the symbol is module-private,
 * so nothing outside this file can reach it and it never becomes public API
 * (SPEC.md §8.1).
 */
interface CatalogueInternals {
  readonly defs: Readonly<Record<string, VariantDef>>
  readonly tags: readonly string[]
}

const INTERNALS: unique symbol = Symbol('nuxt-handler-errors:catalogue')

function internalsOf(catalogue: AnyCatalogue): CatalogueInternals | undefined {
  return (catalogue as { [INTERNALS]?: CatalogueInternals })[INTERNALS]
}

/**
 * `pick` keeps the full `defs` and narrows only `tags`, so `tags` is what
 * enforces the narrowing at runtime — a picked catalogue that was asked for a
 * tag it dropped must not answer for it.
 */
function buildCatalogue<E extends AnyVariant>(
  defs: Readonly<Record<string, VariantDef>>,
  tags: readonly string[]
): ErrorCatalogue<E> {
  const internals: CatalogueInternals = { defs, tags }

  // Cast because the runtime object carries no `[ERRORS]` property: the brand
  // is phantom and exists only in the type.
  return {
    [INTERNALS]: internals,
    pick: (...picked: readonly string[]) =>
      buildCatalogue(
        defs,
        picked.filter((tag) => tags.includes(tag))
      ),
    raise: (tag: string, fields?: Record<string, unknown>) =>
      raiseFrom([internals], tag, fields),
  } as unknown as ErrorCatalogue<E>
}

/**
 * The first catalogue in scope that declares this tag **and** still lists it
 * after `.pick()`, or `undefined`.
 *
 * First rather than last, so composition order is what decides when two
 * catalogues declare the same tag — which the duplicate-tag guard already makes
 * a compile error unless the two are identical, in which case the choice does
 * not matter. This is also the whole of SPEC.md §3.3's *"the status is
 * swappable"*: an app that declares its own `invalid-input` at 422 and lists it
 * gets 422 here, because the lookup happens at run time against what the route
 * composed rather than against anything the module holds.
 */
function findVariant(
  catalogues: readonly CatalogueInternals[],
  tag: string
): VariantDef | undefined {
  for (const internals of catalogues) {
    const def = internals.defs[tag]
    if (def !== undefined && internals.tags.includes(tag)) return def
  }

  return undefined
}

/**
 * Resolve a tag against the catalogues in scope and raise it.
 *
 * The unknown-tag throw is unreachable through the typed surface — both `fail`
 * and `.raise` are scoped to the declared union — so it exists for JavaScript
 * callers and for `.raise`'s unenforced escape hatch, and it is a plain `Error`
 * on purpose: it is a programming mistake, not a declared failure, and must not
 * arrive at a client wearing the marker.
 */
function raiseFrom(
  catalogues: readonly CatalogueInternals[],
  tag: string,
  fields: Record<string, unknown> | undefined
): never {
  const def = findVariant(catalogues, tag)

  if (def === undefined) {
    throw new Error(`[nuxt-handler-errors] undeclared error tag: ${tag}`)
  }

  raiseDeclared(tag, def.status, fields ?? {})
}

/**
 * Declare a route's expected failures once, as a plain object literal of
 * variants (SPEC.md §3.2).
 *
 * Status is inline per variant and has no default. Literal types survive: a
 * status written as `404` stays `404`, and a payload union stays that union,
 * all the way through to the client.
 *
 * Location-agnostic — the module never looks at where a catalogue lives,
 * because the union travels via the brand. `shared/` is the documented default
 * only because a `server/`-only catalogue cannot later be used as a runtime
 * value on the client without a file move that touches every import.
 */
export const defineErrors: DefineErrors = (defs) =>
  buildCatalogue(defs, Object.keys(defs))

/**
 * The tag the module raises a validation failure under (SPEC.md §3.3).
 *
 * Typed as {@link ValidationTag} so the literal in `/types` and the one this
 * catalogue is keyed by cannot drift apart without a compile error here.
 */
const VALIDATION_TAG: ValidationTag = 'invalid-input'

/**
 * The status the module answers a malformed request with when the route did not
 * declare one of its own.
 *
 * Deliberately un-annotated: `const` infers the literal `400`, and an
 * `: ErrorStatus` annotation would widen the shipped catalogue's `status` to the
 * whole union and take a route's published type with it. Written once because
 * both places that need it mean the same thing — the catalogue below, and the
 * unmarked throw a route that did not list a catalogue gets.
 */
const VALIDATION_STATUS = 400

/**
 * The module's own catalogue for a malformed request (SPEC.md §3.3).
 *
 * ```ts
 * import { defineTypedEventHandler, invalidInput } from '@dphonys/nuxt-handler-errors/shared'
 *
 * export default defineTypedEventHandler(
 *   { errors: [invalidInput], body: CreateUser },
 *   async (event, { body }) => db.users.create(body),
 * )
 * ```
 *
 * **One plain catalogue value, and an entirely ordinary one.** It is a
 * `defineErrors` product like any other: it composes, it is subject to the
 * duplicate-tag guard, it has `.pick()` (vacuously) and `.raise()`. Nothing
 * about it is special-cased anywhere in this file.
 *
 * **It is never implicitly present.** A route that declares a schema and does
 * not list it still validates and still fails — unmarked, through the ordinary
 * Nuxt error channel — so the union a route publishes is exactly what it wrote
 * in `errors: [...]`. *The cost, stated plainly:* an author who wanted the
 * typed variant and forgot the catalogue gets no compile signal, and finds out
 * when the tag is missing from the client's union. A presence guard plus an
 * opt-out flag would catch that mistake and reintroduce the same silence
 * through the flag (SPEC.md §11.4).
 *
 * **One variant, not one per location.** `location` sits on the *issue*, which
 * is what lets one response report a bad `body` and a bad `query` together.
 * Per-location tags would force every route to keep a `.pick()` list in
 * agreement with its schema keys, with nothing checking it.
 */
export const invalidInput = defineErrors({
  [VALIDATION_TAG]: {
    status: VALIDATION_STATUS,
    payload: payload<{ issues: ValidationIssue[] }>(),
  },
})

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

/**
 * Where each declared location's raw value comes from.
 *
 * Three h3 utilities and no cleverness — but the choice of `getRouterParams`
 * for `params` is one of the two things h3 v2 could never be delegated to,
 * since v2's own validated handler has no `params` concept at all
 * (SPEC.md §7.4).
 *
 * A `Record` keyed by the closed union rather than a cascade, so a fourth
 * location — which SPEC.md §3.3 rejects today and a later major could still add
 * — is a compile error here rather than a silent fall-through onto whichever
 * reader the cascade ended with.
 */
const READERS: Record<ValidationLocation, (event: H3Event) => unknown> = {
  body: (event) => readBody(event),
  query: (event) => getQuery(event),
  params: (event) => getRouterParams(event),
}

/**
 * Raise a validation failure, marked if the route listed a catalogue for it.
 *
 * The tag is resolved against the route's **composed catalogues at run time**,
 * which is what makes SPEC.md §3.3's status genuinely swappable — and what
 * makes opting out free: no catalogue, no marker, and the failure lands in the
 * ordinary channel with the union the route published still exactly right.
 *
 * The unmarked throw carries the same issues in `data`, one hop shallower —
 * more than SPEC.md §3.3 promises, which is only that it lands in the ordinary
 * channel. It costs nothing, an opted-out route's client can still read them,
 * and it is deliberately *not* the marker: {@link declaredError} answers
 * `undefined` for it, because the route never declared it.
 */
function failValidation(
  catalogues: readonly CatalogueInternals[],
  issues: readonly ValidationIssue[]
): never {
  const def = findVariant(catalogues, VALIDATION_TAG)

  // The route's own variant, at the route's own status — resolved here rather
  // than through `raiseFrom`, which would walk the same catalogues a second
  // time to find what this line already holds.
  if (def !== undefined) raiseDeclared(VALIDATION_TAG, def.status, { issues })

  throw createError({
    statusCode: VALIDATION_STATUS,
    statusMessage: 'Bad Request',
    message: 'Invalid input',
    data: { issues },
  })
}

/**
 * Declare the failures a route can produce, and get a `fail` scoped to exactly
 * those (SPEC.md §3.1) — plus, for every schema on the same options object, its
 * parsed output on the same context (SPEC.md §3.3).
 *
 * The returned handler is an ordinary h3 `EventHandler` with one optional
 * phantom property added, so Nitro, the router and every h3 utility keep
 * treating the route as ordinary — and the success type still infers from the
 * body with no annotation, because `fail` returns `never`.
 *
 * **Validation runs before the handler body, and that ordering has a consequence
 * this module documents rather than solves.** On a route whose auth check lives
 * in the handler, a malformed request from an unauthenticated caller is
 * answered with issue messages that name field names before it is answered with
 * a 401. The answer is auth in Nitro middleware, which runs first.
 *
 * The no-schema route keeps the synchronous shape it had before validation
 * existed, so nothing about a route that declares none of this changed.
 */
export const defineTypedEventHandler: DefineTypedEventHandler = (
  options,
  handler
) => {
  const catalogues: readonly AnyCatalogue[] = options.errors
  const internals = catalogues
    .map((catalogue) => internalsOf(catalogue))
    .filter((entry) => entry !== undefined)

  const fail = (tag: string, fields?: Record<string, unknown>): never =>
    raiseFrom(internals, tag, fields)

  const schemas: DeclaredSchemas = {
    body: options.body,
    query: options.query,
    params: options.params,
  }

  // No cast on the way out: the brand is an *optional* property, so a plain
  // `EventHandler` already inhabits `TypedEventHandler` (SPEC.md §4.1).
  if (!hasDeclaredSchemas(schemas)) {
    return defineEventHandler((event) => handler(event, { fail } as never))
  }

  // The validating form has to be `async`, which makes its return type
  // `Promise<Response>` where `Response` is an unresolved type parameter — a
  // shape nothing can prove inhabits it, however true it is (h3 awaits whatever
  // a handler returns, and Nitro's own `Serialize<Awaited<…>>` is written for
  // exactly this). So this branch pays one assertion that the branch above does
  // not, and it is on the handler rather than on anything the caller wrote.
  const validating = async (event: H3Event): Promise<unknown> => {
    const { issues, values } = await validateDeclaredInput(
      schemas,
      (location) => READERS[location](event)
    )

    if (issues.length > 0) failValidation(internals, issues)

    // Reserved-last, for the reason SPEC.md §5.1's marker is built that way:
    // the fixed names win over anything the spread carries. `values` is keyed
    // by location and cannot collide today — this is what keeps that true the
    // day a fourth key joins either side.
    return handler(event, { ...values, fail } as never)
  }

  return defineEventHandler(validating) as never
}
