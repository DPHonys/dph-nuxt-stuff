/**
 * The dev-server diagnostic, ungated on purpose (SPEC.md §9.6).
 *
 * Run it with `pnpm dev-race` when a Nuxt or Nitro bump is suspected. It is not
 * part of `pnpm check` and must not become part of it: a persistent dev server
 * inside the canonical gate is flaky by construction and is the first thing
 * disabled on a loaded CI box. The invariant that makes the race harmless is
 * structural rather than statistical, and that half is asserted hermetically in
 * `test/types/unreachable-map-key.test.ts` — `MatchedRoutes` derives its key
 * universe from `keyof InternalApi`, so a key this map holds and Nitro's does
 * not is unreachable. What is measured here is the clock and the direction,
 * which is evidence rather than a contract.
 *
 * Three things it answers, and SPEC.md §4.5 records the numbers it produced:
 *
 * 1. **A route added while the server runs reaches this map**, and reaches it
 *    ahead of `nitro-routes.d.ts` — the `:1441`-fires-before-`:1442` ordering,
 *    observed rather than argued. Both waits start from one instant, because a
 *    sequential pair would time the second from after the first converged and
 *    would not be a comparison. This is also the only observation that catches
 *    `types:extend` ceasing to fire: a one-shot `nuxt prepare` renders the
 *    template *after* `nitro:init`, so its output is already complete without
 *    the hook and the gated layer-3 suite cannot see the difference.
 * 2. **A route removed leaves it.**
 * 3. **A content-only edit to a catalogue changes nothing**, which is
 *    SPEC.md §4.4's path-referentiality mandate seen from the dev server.
 *
 * `dev-race-direction.ts` is the companion: it samples *inside* the
 * convergence window and tallies which side is ahead.
 *
 * **It edits tracked sources**, so it restores them from a `finally` block and
 * from a signal handler. Ctrl-C during a run must not leave the tree dirty.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  EMITTED_MAP,
  NITRO_ROUTES,
  PLAYGROUND,
  read,
  SCRATCH_ROUTE,
  startDevServer,
  waitUntil,
} from './dev-server.ts'

const CATALOGUE = join(PLAYGROUND, 'shared/errors/user.ts')
const ADDED_VARIANT = `  'user-rate-limited': { status: 429, payload: payload<{ retryAfter: number }>() },`
const SCRATCH_KEY = `'/api/late'`

const startedAt = Date.now()

/** Every line is stamped, because the whole subject of this script is *when*. */
function log(...parts: unknown[]): void {
  console.log(`[+${String(Date.now() - startedAt).padStart(6)}ms]`, ...parts)
}

/** A wait's answer, printed. `waitUntil` answers `null` for a blown budget. */
function fmt(ms: number | null): string {
  return ms === null ? 'never (budget exhausted)' : `${ms}ms`
}

/**
 * Put the two tracked files back.
 *
 * Synchronous and idempotent so it can run from a signal handler, where an
 * unawaited promise would simply never settle.
 */
function restoreTrackedSources(): void {
  rmSync(SCRATCH_ROUTE, { force: true })

  const catalogue = readFileSync(CATALOGUE, 'utf8')
  if (catalogue.includes('user-rate-limited')) {
    writeFileSync(CATALOGUE, catalogue.replace(`${ADDED_VARIANT}\n`, ''))
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    restoreTrackedSources()
    process.exit(1)
  })
}

const has = (needle: string) => (source: string) => source.includes(needle)
const lacks = (needle: string) => (source: string) => !source.includes(needle)

const dev = await startDevServer(3099)

try {
  log('dev server up')

  // ---- 1. a route added while the server runs ------------------------------
  log('adding server/api/late.get.ts')
  writeFileSync(
    SCRATCH_ROUTE,
    [
      `import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/shared'`,
      `import { userErrors } from '#shared/errors/user'`,
      ``,
      `export default defineTypedEventHandler(`,
      `  { errors: [userErrors.pick('user-not-found')] },`,
      `  (_event, { fail }) => {`,
      `    if (Math.random() < 0) return fail('user-not-found', { userId: 'x' })`,
      `    return { late: true }`,
      `  },`,
      `)`,
      ``,
    ].join('\n')
  )

  // One instant, two clocks. The difference is the whole measurement.
  const [ours, nitro] = await Promise.all([
    waitUntil(EMITTED_MAP, has(SCRATCH_KEY)),
    waitUntil(NITRO_ROUTES, has(SCRATCH_KEY)),
  ])
  log(`route added → our map ${fmt(ours)}, nitro-routes.d.ts ${fmt(nitro)}`)
  if (ours !== null && nitro !== null) {
    log(`  ours ahead by ${nitro - ours}ms (negative means Nitro won)`)
  }
  log(
    `  our map references the new handler:`,
    (await read(EMITTED_MAP)).includes('api/late.get')
  )

  // ---- 2. a content-only edit to a catalogue -------------------------------
  // SPEC.md §4.4: the emitted map must be a function of routes and handler
  // *paths*, never of catalogue content. Nitro never re-runs `writeTypes` on a
  // `change` event, so anything that resolved values at emit time would go
  // stale here with no watcher that would ever fix it.
  log('adding a variant to shared/errors/user.ts (no route change)')
  const beforeEdit = await read(EMITTED_MAP)
  writeFileSync(
    CATALOGUE,
    readFileSync(CATALOGUE, 'utf8').replace(
      `  'user-suspended'`,
      `${ADDED_VARIANT}\n  'user-suspended'`
    )
  )
  await sleep(3000)
  log('emitted map byte-identical:', beforeEdit === (await read(EMITTED_MAP)))

  // ---- 3. the route removed ------------------------------------------------
  log('removing server/api/late.get.ts')
  rmSync(SCRATCH_ROUTE, { force: true })
  const dropped = await waitUntil(EMITTED_MAP, lacks(SCRATCH_KEY))
  log(`route removed → our map ${fmt(dropped)}`)
} finally {
  restoreTrackedSources()
  await dev.stop()
  console.log('\n--- dev server tail ---')
  console.log(dev.output().split('\n').slice(-12).join('\n'))
}
