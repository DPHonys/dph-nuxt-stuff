/**
 * A DELIBERATELY BROKEN fixture, compiled by `misuse-diagnostics.test.ts` and
 * never by `pnpm typecheck`. The one case its sibling cannot carry: the guard
 * fires on a declaration whose handler is also read back through the brand,
 * so the return-type change is proven not to move or reword the diagnostic.
 */

import { z } from 'zod'
import { defineValidatedEventHandler } from '../../../src/runtime/server'
import type { RequestInputOfHandler } from '../../../src/runtime/types'

// --- A stray key is still rejected at that key, and only there -------------

export const strayKeyBranded = defineValidatedEventHandler(
  {
    input: {
      query: z.object({ page: z.coerce.number() }),
      boyd: z.object({ name: z.string() }),
    },
  },
  async (_event, _validated) => null
)

export type StrayKeyInput = RequestInputOfHandler<typeof strayKeyBranded>
