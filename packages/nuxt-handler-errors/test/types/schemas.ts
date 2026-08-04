/**
 * A minimal conforming Standard Schema, for the layer-1 fixtures.
 *
 * Hand-rolled rather than zod on purpose, and it is the point rather than a
 * shortcut: SPEC.md §3.3 inlines the spec's ~50 lines and depends on **no**
 * validator, so the fixtures that assert the declaration surface must be able
 * to make every claim with no validator in the program at all. zod is a
 * devDependency and it appears where the claim is *"a real library works
 * untouched"* — `test/validation.test.ts` and the playground — not here.
 *
 * `safeParse` rides along because it is half of what the negative fixtures are
 * about: it is h3's own JSDoc-recommended spelling, where it *silently disables
 * validation*, and here it must not compile.
 */

import type { StandardSchemaV1 } from '../../src/runtime/types'

/** A conforming schema, with h3's footgun spelling attached. */
export interface TestSchema<Output> extends StandardSchemaV1<unknown, Output> {
  safeParse: (value: unknown) => { success: true; data: Output }
}

/**
 * A schema for `Output`, declared by type argument — there is no validation to
 * do here, because a fixture asserts what the *types* say.
 */
export function schemaOf<Output>(): TestSchema<Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'nuxt-handler-errors-fixture',
      validate: (value: unknown) => ({ value: value as Output }),
    },
    safeParse: (value: unknown) => ({ success: true, data: value as Output }),
  }
}
