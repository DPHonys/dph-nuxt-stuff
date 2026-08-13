import type { VALIDATION_NAME } from '../shared/name'
import type { ValidateSchemas } from './schemas'

/**
 * Types every key outside the four sources as `never`, so nothing but a source
 * can hold a schema.
 *
 * Without it a misspelled key **beside a valid one** compiles silently and that
 * source is never validated - the package quietly not doing its job. The
 * mechanism it replaces, weak-type detection, fires only on **zero** overlap
 * (there is no excess-property check to run: the schema type is inferred *from*
 * the literal), so `{ query: q, boyd: schema }` defeated it with one valid key.
 *
 * The set-name symbol is exempt, and that is not an optimization: without the
 * exemption a set *name* reads as a stray key and every named `defineValidation`
 * is rejected.
 *
 * Internal - a consumer meets this in a diagnostic, never names it.
 */
export type OnlyValidationSources<S> = Record<
  Exclude<keyof S, keyof ValidateSchemas | typeof VALIDATION_NAME>,
  never
>

/**
 * Witness that keeps a malformed group out of the **flat** overload.
 *
 * Guarding only the flat overload is worse than the hole it closes: a malformed
 * group fails the array overload, falls through to the flat one and - the
 * guarded parameter no longer being a weak type - is *accepted*, handing the
 * handler the widened `unknown` floor with no diagnostic at all. An array has a
 * `length`; a schema declaration does not.
 *
 * Accepted cost, stated rather than discovered: every array-form failure gains
 * a `'length' is not assignable to 'never'` line in the second overload's
 * paragraph.
 *
 * Internal, like its file-mate - a consumer meets it in a diagnostic and fixes
 * the declaration, never names it.
 */
export interface NotAGroup {
  readonly length?: never
}
