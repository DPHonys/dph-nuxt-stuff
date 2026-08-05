import { createRequire } from 'node:module'
import process from 'node:process'
import ts from 'typescript'
import type { CompilerDialect, TypeScriptModule } from './harness'

/**
 * The compiler rows every `createTypeHarness` suite runs under
 * (SPEC.md §9.8).
 *
 * Row one is the pinned tsgo bridge — the canonical gate's own checker. Row
 * two is **stock TypeScript**, the compiler every downstream consumer of the
 * emitted `.d.ts` actually runs, resolved through the `typescript-stock`
 * alias: pnpm overrides key on the dependency alias, never on the package
 * name inside an `npm:` spec, so `"typescript-stock": "npm:typescript@^5"`
 * escapes the workspace-wide bridge override untouched. The caret floats on
 * purpose — a new stock minor breaking this suite is precisely the
 * consumer-divergence signal the second row exists to catch. Never rename
 * the alias to `typescript`: any dependency key with that name is rewritten
 * to the bridge regardless of its spec.
 *
 * The stock row joins only when the flag below is set. `pnpm test` sets it,
 * so the full run — and therefore CI and turbo — always checks both
 * compilers; `pnpm test:watch` leaves it unset, keeping iteration on the
 * ~15× faster bridge. The flag is an escape hatch for local loops, not a
 * second gate.
 */

/** Set to any non-empty value to add the stock-TypeScript row. */
const STOCK_FLAG = 'NUXT_HANDLER_ERRORS_STOCK_TS'

/**
 * One compiler the suites run under, shaped for `describe.each`: the label
 * `%s` prints, the module itself, and the dialect the harness resolves
 * per-compiler expectation overrides against.
 */
export type CompilerRow = readonly [
  label: string,
  compiler: TypeScriptModule,
  dialect: CompilerDialect,
]

function stockRow(): CompilerRow {
  // `require` rather than a static import: the module is only paid for when
  // the flag asks for it, and the alias must be loaded under its own name —
  // resolving `typescript` anywhere in this workspace answers the bridge.
  // The cast is deliberate: the alias resolves a TS 5.x module, whose own
  // declaration file predates the bridge's TS 6 surface, and the harness
  // exercises only the API both share.
  const stock = createRequire(import.meta.url)(
    'typescript-stock'
  ) as TypeScriptModule

  return [
    `stock typescript ${stock.version} (the consumer compiler)`,
    stock,
    'stock',
  ]
}

const BRIDGE: CompilerRow = [
  'typescript-native-bridge (the pinned gate)',
  ts,
  'bridge',
]

export const COMPILERS: readonly CompilerRow[] = process.env[STOCK_FLAG]
  ? [BRIDGE, stockRow()]
  : [BRIDGE]
