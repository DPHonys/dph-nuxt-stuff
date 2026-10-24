import type { StandardSchemaV1 } from '@standard-schema/spec'
import { isRecordLike, isStandardSchema, isString } from '../../shared/guards'
import type {
  EntryKeysGuard,
  ErrorDeclarations,
  ErrorEntry,
  ReservedTag,
  TagGuard,
} from '../../types/errors/declaration'
import { declarationFault, describeValue } from '../faults'

/** The tags the package keeps for its own variants. */
const RESERVED_TAGS: readonly string[] = [
  'validation-failed',
  'request-failed',
] satisfies readonly ReservedTag[]

/** The keys an entry may carry. */
const ENTRY_KEYS: readonly string[] = ['status', 'schema']

/** One Error declaration, checked and read off the author's entry. */
export interface ResolvedErrorEntry {
  readonly tag: string
  readonly status: number
  readonly schema: StandardSchemaV1 | undefined
}

/**
 * A route's checked Error declarations by tag. Prototype-less, because
 * `__proto__` and `constructor` are legal tags: a lookup finds an own entry
 * or nothing.
 */
export type ResolvedErrors = Readonly<Record<string, ResolvedErrorEntry>>

function isErrorStatus(status: unknown): status is number {
  return (
    Number.isInteger(status) && Number(status) >= 400 && Number(status) <= 599
  )
}

function checkTag(tag: string): void {
  if (tag === '') {
    throw declarationFault(
      'An error tag must be a non-empty string - rename the error declared under the empty key.'
    )
  }

  if (RESERVED_TAGS.includes(tag)) {
    throw declarationFault(
      `The error tag "${tag}" is reserved for the built-in ${tag} variant. Rename the declared error.`
    )
  }
}

function checkSchema(tag: string, entry: ErrorEntry): void {
  if (!isRecordLike(entry)) return

  const { schema } = entry

  if (schema === undefined || isStandardSchema(schema)) return

  throw declarationFault(
    `The schema of error "${tag}" must be a Standard Schema, not ${describeValue(schema)}.`
  )
}

function checkStatus(tag: string, entry: ErrorEntry): void {
  if (!isRecordLike(entry)) {
    throw declarationFault(
      `Error "${tag}" must be declared as { status, schema? }, not ${describeValue(entry)}.`
    )
  }

  if (isErrorStatus(entry.status)) return

  throw declarationFault(
    `The status of error "${tag}" must be an integer from 400 to 599, not ${describeValue(entry.status)}.`
  )
}

function checkKeys(tag: string, entry: ErrorEntry): void {
  if (!isRecordLike(entry)) return

  const unknownKey = Object.keys(entry).find((key) => !ENTRY_KEYS.includes(key))

  if (unknownKey === undefined) return

  throw declarationFault(
    `Error "${tag}" declares an unknown key "${unknownKey}". An entry takes status and schema only.`
  )
}

/**
 * Check a route's Error declarations and read them into a lookup by tag,
 * throwing at the first rule broken. The rules run one at a time over every
 * entry, in a fixed order, so the sentence a misdeclared route throws does not
 * depend on the order its keys were written in: a reserved tag, then a schema
 * that is not a Standard Schema, then a status out of range, then a key an
 * entry does not take.
 *
 * Runs at declaration, when the route module is evaluated, so a misdeclared
 * route throws before it serves anything.
 */
export function resolveErrors(errors: ErrorDeclarations): ResolvedErrors {
  const entries = Object.entries(errors)

  for (const [tag] of entries) checkTag(tag)
  for (const [tag, entry] of entries) checkSchema(tag, entry)
  for (const [tag, entry] of entries) checkStatus(tag, entry)
  for (const [tag, entry] of entries) checkKeys(tag, entry)

  // `Object.create(null)` is untyped; the annotation is what it holds.
  const resolved: Record<string, ResolvedErrorEntry> = Object.create(null)

  for (const [tag, entry] of entries) {
    // The checks above passed on this same object, so this skips nothing; it
    // is what tells the compiler so.
    if (!isRecordLike(entry) || !isErrorStatus(entry.status)) continue

    const schema = isStandardSchema(entry.schema) ? entry.schema : undefined

    resolved[tag] = { tag, status: entry.status, schema }
  }

  return resolved
}

/**
 * Declare one expected failure as a one-key `errors` map, so it spreads into
 * any route's declaration beside others:
 *
 * ```ts
 * export const orderNotFound = defineError('order-not-found', {
 *   status: 404,
 *   schema: z.object({ id: z.number() }),
 * })
 *
 * errors: { ...orderNotFound, 'order-locked': { status: 409 } }
 * ```
 *
 * The entry is checked here, so a misdeclared error throws where it is
 * declared rather than at the first route that spreads it.
 */
export function defineError<
  const Tag extends string,
  const Entry extends ErrorEntry,
>(
  tag: Tag & TagGuard<Tag, Entry>,
  entry: Entry & EntryKeysGuard<Entry>
): { readonly [Key in Tag]: Entry }
// The signature above carries the literal tag and entry into the return type;
// at runtime the one-key object is built from a string the types cannot see.
export function defineError(tag: string, entry: ErrorEntry): ErrorDeclarations {
  // The compile guard's answer for a caller the types never saw. A map key is
  // always a string, so only this door can be handed anything else.
  if (!isString(tag)) {
    throw declarationFault(
      `An error tag must be a non-empty string, not ${describeValue(tag)}.`
    )
  }

  // Checked as the one-key map it becomes, so it breaks the rules a route's
  // own `errors` would, in the same order and with the same sentences. Past
  // the checks the entry holds `status` and `schema` and nothing else.
  resolveErrors({ [tag]: entry })

  return { [tag]: entry }
}
