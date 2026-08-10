/**
 * The second half of the dev-server diagnostic, ungated.
 *
 * `dev-race.ts` measures how long convergence takes. This one samples *inside*
 * the window and asks which side is ahead, because that is the question that
 * decides whether the window matters at all:
 *
 * - **ours ahead** — an extra key in this map. Inert: `MatchedRoutes` derives
 *   its key universe from `keyof InternalApi`, so a key Nitro does not have is
 *   unreachable by construction (asserted in
 *   `test/types/unreachable-map-key.test.ts`).
 * - **nitro ahead** — a route Nitro knows and this map does not. The lookup
 *   yields `never`, so the route reads as undeclared: graceful degradation, not
 *   a wrong type.
 * - **misattributed** — a route keyed to a handler file that is not its own.
 *   The only shape that produces a *wrong* error type rather than an absent
 *   one, and the only tally that must stay at zero. A recorded run produced
 *   `agree 31, oursAhead 9, nitroAhead 0, misattributed 0` over 40 samples.
 *
 * Two liveness tallies are printed beside them, and they are not decoration: a
 * dev server that died, or never rebuilt, produces `agree 40, misattributed 0`
 * — indistinguishable from a perfect run. The `sightings` pair says the
 * experiment actually happened.
 *
 * Run it with `pnpm dev-race:direction`. It writes and deletes one **untracked**
 * scratch route and edits nothing else.
 */

import { rmSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  EMITTED_MAP,
  NITRO_ROUTES,
  read,
  SCRATCH_ROUTE,
  startDevServer,
} from './dev-server.ts'

const SAMPLES = 40
const SCRATCH_KEY = `'/api/late'`

/** One `'route': { … }` block of the emitted map. */
const ROUTE_BLOCK = /'(\/api\/[^']+)': \{([^}]*)\}/g

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    rmSync(SCRATCH_ROUTE, { force: true })
    process.exit(1)
  })
}

const dev = await startDevServer(3098)

try {
  console.log('dev server up')

  const tally = {
    agree: 0,
    oursAhead: 0,
    nitroAhead: 0,
    misattributed: 0,
    /** Samples in which each file actually held the scratch route. */
    sightings: { ours: 0, nitro: 0 },
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    // Alternating add and remove, because both directions have to be sampled —
    // and because *which* one it is decides how the sample reads. On a removal,
    // the file that still lists the route is the one that has **not** caught up.
    const adding = sample % 2 === 0

    if (adding) {
      writeFileSync(
        SCRATCH_ROUTE,
        `export default defineEventHandler(() => ({ sample: ${sample} }))\n`
      )
    } else {
      rmSync(SCRATCH_ROUTE, { force: true })
    }

    // Sample at a varying offset inside the convergence window rather than
    // after it — sampling only once converged would tally `agree` every time
    // and measure nothing.
    await sleep(40 + (sample % 7) * 60)

    // Read both together, so the few milliseconds it takes to read the first
    // do not bias every sample toward the second being ahead.
    const [ours, nitro] = await Promise.all([
      read(EMITTED_MAP),
      read(NITRO_ROUTES),
    ])
    const weHave = ours.includes(SCRATCH_KEY)
    const theyHave = nitro.includes(SCRATCH_KEY)

    if (weHave) tally.sightings.ours++
    if (theyHave) tally.sightings.nitro++

    // "Ahead" is *converged on the edit just made*, not *lists the route*.
    // Reading it the second way — which the prototype's script did, and which
    // is where the recorded tally above comes from — inverts every removal sample.
    if (weHave === theyHave) tally.agree++
    else if (weHave === adding) tally.oursAhead++
    else tally.nitroAhead++

    for (const [, route, block] of ours.matchAll(ROUTE_BLOCK)) {
      // Both groups always participate in a match, so this guard can never
      // fire; it exists because `noUncheckedIndexedAccess` types a destructured
      // match element as possibly `undefined`.
      if (route === undefined || block === undefined) continue

      // A `:param` route or a glob does not name its handler file, so this
      // cheap check cannot decide it. That is a real limit on the scan: it
      // sees the routes whose keying is trivial, which are also the ones a
      // misattribution would be easiest to spot in.
      if (route.includes(':') || route.includes('**')) continue
      if (!block.includes(`api/${route.replace('/api/', '')}`)) {
        tally.misattributed++
      }
    }
  }

  console.log(JSON.stringify(tally, null, 2))

  if (tally.sightings.ours === 0 || tally.sightings.nitro === 0) {
    console.log(
      '\nNo sightings on one side — the dev server never picked the route up,',
      '\nso every tally above is vacuous. Check the server tail before reading them.'
    )
    console.log(dev.output().split('\n').slice(-12).join('\n'))
  }
} finally {
  rmSync(SCRATCH_ROUTE, { force: true })
  await dev.stop()
}
