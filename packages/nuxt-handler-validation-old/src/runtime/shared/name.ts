/**
 * The key a validation set's name rides under, shared by the type machinery
 * that reads it and the definer that writes it.
 *
 * A `unique symbol`, and both halves of that matter. As a **symbol** it never
 * appears in `Object.keys(fragment)`, so the runtime iterates a fragment's
 * source keys with no exclusion list and the name can never be mistaken for a
 * source. As a **unique** symbol it is unspellable from a consumer's code, so a
 * named set can only come from `defineValidation`'s named form and no
 * hand-written object literal can forge one.
 *
 * `Symbol.for` rather than `Symbol()`: two physical copies of this package in
 * one dependency tree should still read each other's set names, since nothing
 * here defends an identity - the unforgeability is the *type*'s, not the
 * runtime value's.
 *
 * This file carries a runtime value and is deliberately not re-exported from
 * the `/types` entry; the type machinery reaches it with `import type`, which
 * erases, so the type-only entry stays type-only.
 */
export const VALIDATION_NAME: unique symbol = Symbol.for(
  '@dphonys/nuxt-handler-validation:name'
)
