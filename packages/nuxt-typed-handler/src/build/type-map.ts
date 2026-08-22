// The one generated file, as a thing rather than a procedure: the errors
// parent's slot reused verbatim beside the umbrella's own request-inputs
// slot, the seed a cold build writes before Nitro exists, and the render of a
// scanned handler set. Kept out of `module.ts` so a suite can ask for the
// real map - slots respelled in a test prove only the test.

import {
  emitMap,
  emptyMap,
  KNOWN_ERRORS_SLOT,
} from '@dphonys/nuxt-handler-errors/internals/build'
import type {
  EmitMapSlot,
  NitroPathOptions,
} from '@dphonys/nuxt-handler-errors/internals/build'
import type { NitroEventHandler } from 'nitropack/types'

/**
 * The specifier the request-inputs map augments: this module's own `/types`.
 * Exported so `setup()`'s `typescript.hoist.push(...)` cannot drift from the
 * string actually emitted.
 */
export const TYPES_SPECIFIER = '@dphonys/nuxt-typed-handler/types'

/**
 * The request-inputs map, beside the errors parent's slot in the one file.
 *
 * No `Serialize`: the input *is* the wire shape by the author's intent, and
 * `query` must not be serialised. `Simplify` comes from where the parent's
 * slot sources it, so the two slots share one import line.
 */
const REQUEST_INPUTS_SLOT: EmitMapSlot = {
  interfaceName: 'KnownApiRequestInputs',
  specifier: TYPES_SPECIFIER,
  imports: [
    { names: ['Simplify'], from: 'nitropack/types' },
    {
      names: ['RequestInputOfHandler'],
      from: '@dphonys/nuxt-handler-validation/types',
    },
  ],
  extract: (handlerType) => `Simplify<RequestInputOfHandler<${handlerType}>>`,
}

/** Both maps, in emit order: the parent's errors slot first. */
const SLOTS: readonly EmitMapSlot[] = [KNOWN_ERRORS_SLOT, REQUEST_INPUTS_SLOT]

/** The generated file this module owns, in the three states a build reads. */
export interface TypeMap {
  /**
   * Where the file lands, under the build directory. `types/` is Nitro's
   * `typesDir`: every handler specifier the emitter computes is relative to
   * it, and an unresolved `import('…')` in a `.d.ts` produces no diagnostic.
   *
   * Typed as kit types a declaration template's filename, so the two cannot
   * drift.
   */
  readonly filename: `${string}.d.ts`
  /** What a build writes before Nitro exists: one empty interface per slot. */
  readonly empty: string
  /** Both maps over one scanned handler set, in one file. */
  readonly emit: (
    handlers: readonly NitroEventHandler[],
    nitroOptions: NitroPathOptions
  ) => string
}

/** The generated map of the module named `name`, banner and filename included. */
export function typeMap(name: string): TypeMap {
  return {
    filename: `types/${name}.d.ts`,
    empty: emptyMap({ slots: SLOTS, generatedBy: name }),
    emit: (handlers, nitroOptions) =>
      emitMap(handlers, { nitroOptions, slots: SLOTS, generatedBy: name }),
  }
}
