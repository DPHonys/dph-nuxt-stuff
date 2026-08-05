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

import { createError, defineEventHandler } from 'h3'
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
  VariantDef,
} from './types'

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
 * What `errors: [...]` was handed, when it was not a catalogue **this copy of
 * the module** created.
 *
 * `INTERNALS` is a module-private `Symbol()`, so it is per module *instance*
 * rather than per package name: a catalogue built by a second physical copy of
 * `@dphonys/nuxt-handler-errors` — a version duplicate, a Nuxt layer or a
 * published module that resolved its own — carries a symbol this file cannot
 * see, and reads as no catalogue at all. It is the same class of hazard
 * SPEC.md §7.2 keeps `h3` on a caret range for, arriving through the one door
 * a range cannot close.
 *
 * **Throwing here is the whole point of the function.** Skipping the entry
 * instead is what the code did first, and it is a strictly worse failure: the
 * misconfiguration is invisible until some later request happens to raise a tag
 * that catalogue declared, at which point `raiseFrom` reports it as an
 * undeclared tag — which is false, points away from the cause, and reaches the
 * client as an unhandled 500 rather than the declared failure the route's
 * published type promised. A route whose declaration cannot be honoured is
 * broken at the moment it is declared, and that is when it says so: at module
 * evaluation, before the route serves anything.
 *
 * A `Symbol.for()` registry would make the two copies interoperate instead, and
 * it is deliberately not used. The *wire* survives a second copy already —
 * `DECLARED_ERROR_KEY` is frozen protocol and both copies spell it identically,
 * which is exactly what SPEC.md §5.2 froze it for — but the `h3` augmentation
 * `event.$typedFetch` rides does not: a module augmentation binds to a resolved
 * path, so the second copy declares it on an `h3` the consumer is not using.
 * Making the catalogue quietly work across copies would conceal a state whose
 * other consequences this file cannot fix.
 */
function raiseForeignCatalogue(index: number): never {
  throw new Error(
    `[nuxt-handler-errors] errors[${index}] is not a catalogue created by this copy of the module. ` +
      `Either it did not come from defineErrors(), or there are two copies of ` +
      `@dphonys/nuxt-handler-errors in the dependency tree — a version duplicate, or a Nuxt ` +
      `layer or package that resolved its own. Deduplicate it so every catalogue and every ` +
      `handler come from one copy.`
  )
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
 * The unknown-tag throw is unreachable through the typed surface — `fail` is
 * scoped to the declared union — so it exists for JavaScript callers, and it is
 * a plain `Error` on purpose: it is a programming mistake, not a declared
 * failure, and must not arrive at a client wearing the marker.
 *
 * It is also the only thing that message can mean. A catalogue this module
 * cannot read is rejected at declaration by {@link raiseForeignCatalogue}, so a
 * tag reported here as undeclared is never one that was declared into a
 * catalogue that silently failed to resolve.
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

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

/**
 * Declare the failures a route can produce, and get a `fail` scoped to exactly
 * those (SPEC.md §3.1).
 *
 * The returned handler is an ordinary h3 `EventHandler` with one optional
 * phantom property added, so Nitro, the router and every h3 utility keep
 * treating the route as ordinary — and the success type still infers from the
 * body with no annotation, because `fail` returns `never`.
 *
 * The catalogues are resolved **here**, at declaration, rather than lazily
 * inside `fail`: this runs once per route at module evaluation, and it is what
 * makes {@link raiseForeignCatalogue}'s failure arrive before the route serves
 * a request rather than on whichever one first raises.
 */
export const defineTypedEventHandler: DefineTypedEventHandler = (
  options,
  handler
) => {
  const catalogues: readonly AnyCatalogue[] = options.errors
  const internals = catalogues.map(
    (catalogue, index) => internalsOf(catalogue) ?? raiseForeignCatalogue(index)
  )

  const fail = (tag: string, fields?: Record<string, unknown>): never =>
    raiseFrom(internals, tag, fields)

  // No cast on the way out: the brand is an *optional* property, so a plain
  // `EventHandler` already inhabits `TypedEventHandler` (SPEC.md §4.1).
  return defineEventHandler((event) => handler(event, { fail } as never))
}
