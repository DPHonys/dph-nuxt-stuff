/**
 * The validation adapter (SPEC.md §3.3, §7.4).
 *
 * This module owns validation rather than adapting h3's, and it is the one
 * place a Standard Schema is called. Two properties are the whole reason it
 * exists:
 *
 * - **What reaches the client is machine-readable.** h3 1.15.11 throws the raw
 *   exception as `data`, which serializes to `{ name, message }` — a client
 *   gets a sentence, not a field list.
 * - **Every declared location is validated**, so one response reports
 *   everything that is wrong. Fail-fast per source makes a caller fix `body`,
 *   resubmit, and only then learn `query` was also wrong.
 *
 * ## The seam, and why it is here rather than in `./shared`
 *
 * `read` is a parameter. Everything above it — `readBody`, `getQuery`,
 * `getRouterParams` — is h3's, and everything below is arithmetic over an
 * untrusted value: what an issue's path normalises to, what happens when a
 * source cannot be read at all, and in what order the answers arrive. Splitting
 * there is what lets the hostile half be tested against hostile input directly
 * rather than through a built server.
 *
 * ## It is permanent (SPEC.md §7.4)
 *
 * h3 v2 has nothing to delegate to: no `params` at all, a query output coerced
 * back to string by construction, a lazy body `Proxy`, fail-fast per source,
 * and issues with no `location` on them. No version branch ships and runtime
 * feature detection stays rejected. Read 13's *"designed to be deleted"* as
 * "costs nothing either way".
 */

import type {
  StandardSchemaV1,
  ValidationIssue,
  ValidationLocation,
} from './types'

/**
 * The declared locations, in the order their issues are reported.
 *
 * Fixed rather than derived from `Object.keys(schemas)`, so the order a client
 * renders a form's errors in cannot depend on the order an author happened to
 * write the options object in.
 */
export const VALIDATION_LOCATIONS: readonly ValidationLocation[] = [
  'body',
  'query',
  'params',
]

/** The schema half of a typed handler's options, as the adapter reads it. */
export type DeclaredSchemas = {
  [Location in ValidationLocation]?: StandardSchemaV1 | undefined
}

/** What one pass over the declared locations produced. */
export interface ValidationOutcome {
  /** Empty means every declared location parsed. */
  readonly issues: readonly ValidationIssue[]
  /** One entry per declared location, keyed by it. Only complete when `issues` is empty. */
  readonly values: Readonly<Partial<Record<ValidationLocation, unknown>>>
}

/** Whether anything at all is declared — the cheap check the definer branches on. */
export function hasDeclaredSchemas(schemas: DeclaredSchemas): boolean {
  return VALIDATION_LOCATIONS.some(
    (location) => schemas[location] !== undefined
  )
}

/**
 * Parse every declared location, and report everything that is wrong at once.
 *
 * `read` is called **only** for a declared location and **only** once, so a
 * route that declares `query` alone never touches the request body — which
 * matters, because reading a body h3 will not read is a 405 rather than a
 * no-op.
 *
 * **A source that cannot be read is an issue at that location, not a throw.**
 * `readBody` turns a malformed JSON body into its own unmarked 400 and a body
 * read on a method h3 does not accept one for into a 405; letting either escape
 * would mean a client sees a *declared* failure for a body that is the wrong
 * shape and an *undeclared* one for a body that is not JSON at all — the same
 * mistake, reported through two different channels. The path is `[]` because
 * the whole value is what could not be read.
 *
 * The result is **always awaited**. `~standard.validate` carries a promise arm
 * even for a synchronous schema (a plain `z.object(…)` returns its result
 * directly), and awaiting a non-promise costs a microtask.
 */
export async function validateDeclaredInput(
  schemas: DeclaredSchemas,
  read: (location: ValidationLocation) => unknown
): Promise<ValidationOutcome> {
  const issues: ValidationIssue[] = []
  const values: Partial<Record<ValidationLocation, unknown>> = {}

  for (const location of VALIDATION_LOCATIONS) {
    const schema = schemas[location]
    if (schema === undefined) continue

    let raw: unknown
    try {
      raw = await read(location)
    } catch {
      issues.push({
        location,
        path: [],
        message: `The request ${location} could not be read.`,
      })
      continue
    }

    const result = await schema['~standard'].validate(raw)

    if (result.issues === undefined) {
      values[location] = result.value
      continue
    }

    const before = issues.length

    // `Array.isArray` here and on `path` below, for one reason: the spread and
    // the `for…of` both throw on anything non-iterable, and this module
    // normalises whatever a *consumer's* validator produces rather than only
    // what its types promise. A thrown adapter is a 500 where a 400 naming the
    // bad field was owed — which is h3's own footgun through a different door.
    // Anything unreadable falls through to the whole-value issue below.
    for (const issue of Array.isArray(result.issues) ? result.issues : []) {
      issues.push({
        location,
        path: Array.isArray(issue.path) ? issue.path.map(toPathSegment) : [],
        message: issue.message,
      })
    }

    // The invariant the definer rests on: a location either has a parsed value
    // or has at least one issue, never neither. A `{ issues: [] }` result is a
    // failure by the spec's own discriminant — `issues` present — and nothing
    // in the spec's *types* forbids the array being empty. Without this line
    // such a result would report nothing wrong, so the handler would run with
    // `body` undefined while its type said "already parsed", which is the one
    // outcome this whole surface exists to make unrepresentable.
    if (issues.length === before) {
      issues.push({
        location,
        path: [],
        message: `The request ${location} is invalid.`,
      })
    }
  }

  return { issues, values }
}

/**
 * One spec path entry, normalised to what JSON can carry.
 *
 * The spec's entry is `PropertyKey | { key: PropertyKey }` — libraries differ,
 * and both forms are live — while a payload has to be one shape a client can
 * narrow. Symbols cannot cross the wire at all, so they become their
 * `String(…)` form; a number stays a number, which is what keeps an array index
 * distinguishable from a key that looks like one.
 *
 * `entry` is `unknown` rather than the spec's own union, and the null check is
 * the reason: `typeof null === 'object'`, so a validator that puts a `null` in
 * a path — nothing in the spec's *types* forbids it, and this module calls into
 * whatever a consumer hands it — would otherwise throw a `TypeError` **inside
 * the adapter**, turning a 400 that names the bad field into a genuine
 * unhandled 500. `String(…)` also covers a symbol, where a template literal
 * would throw.
 */
function toPathSegment(entry: unknown): string | number {
  const key = isPathSegment(entry) ? entry.key : entry

  return typeof key === 'number' ? key : String(key)
}

/** See {@link toPathSegment}. */
function isPathSegment(entry: unknown): entry is { readonly key: PropertyKey } {
  return typeof entry === 'object' && entry !== null && 'key' in entry
}
