// The generated file as a value, kept out of `module.ts` so a suite can ask
// for the real map - slots respelled in a test prove only the test.

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
 * The specifier the request-inputs map augments. Exported so `setup()`'s
 * `typescript.hoist.push(...)` cannot drift from the string actually emitted.
 */
export const TYPES_SPECIFIER = '@dphonys/nuxt-typed-handler/types'

// No `Serialize`: the input *is* the wire shape by the author's intent, and
// `query` must not be serialised.
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

const SLOTS: readonly EmitMapSlot[] = [KNOWN_ERRORS_SLOT, REQUEST_INPUTS_SLOT]

export interface TypeMap {
  /**
   * Must live under `types/` - Nitro's `typesDir` - because every handler
   * specifier the emitter computes is relative to it, and an unresolved
   * `import('…')` in a `.d.ts` produces no diagnostic.
   */
  readonly filename: `${string}.d.ts`
  /** What a build writes before Nitro exists: one empty interface per slot. */
  readonly empty: string
  readonly emit: (
    handlers: readonly NitroEventHandler[],
    nitroOptions: NitroPathOptions
  ) => string
}

export function typeMap(name: string): TypeMap {
  return {
    filename: `types/${name}.d.ts`,
    empty: emptyMap({ slots: SLOTS, generatedBy: name }),
    emit: (handlers, nitroOptions) =>
      emitMap(handlers, { nitroOptions, slots: SLOTS, generatedBy: name }),
  }
}
