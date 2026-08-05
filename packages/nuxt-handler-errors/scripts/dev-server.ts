/**
 * What both dev-server diagnostics need: the playground's paths, and a dev
 * server you can start, poll and stop.
 *
 * Extracted because the two scripts are the same experiment asked two different
 * questions — `dev-race.ts` times convergence, `dev-race-direction.ts` samples
 * inside it — and a second copy of the spawn/poll/teardown dance would be free
 * to drift from the first while both kept printing numbers.
 *
 * Nothing here is gated (SPEC.md §9.6). See `dev-race.ts` for why. These run as
 * TypeScript directly under Node's type stripping, which every Node line in the
 * package's `engines` range ships enabled — so the relative import below must
 * spell the real `.ts` extension, and everything here stays erasable syntax.
 */

import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const PLAYGROUND = join(PACKAGE_ROOT, 'playground')

/** This module's generated map. */
export const EMITTED_MAP = join(
  PLAYGROUND,
  '.nuxt/types/nuxt-handler-errors.d.ts'
)

/** Nitro's, written immediately after ours by the same `writeTypes` call. */
export const NITRO_ROUTES = join(PLAYGROUND, '.nuxt/types/nitro-routes.d.ts')

/** The route both scripts add and remove. */
export const SCRATCH_ROUTE = join(PLAYGROUND, 'server/api/late.get.ts')

/** Read a file that may not exist yet, as the empty string. */
export const read = (path: string): Promise<string> =>
  readFile(path, 'utf8').catch(() => '')

export interface DevServer {
  /** Everything the server has printed so far. */
  output: () => string
  stop: () => Promise<void>
}

/**
 * Boot `nuxt dev` on the playground and wait for it to listen.
 *
 * `--no-fork` keeps the server in one child process, so `stop()` really stops
 * it; a forked dev server survives its parent and holds the port.
 */
export async function startDevServer(port: number): Promise<DevServer> {
  const child = spawn(
    join(PACKAGE_ROOT, 'node_modules/.bin/nuxt'),
    ['dev', PLAYGROUND, '--port', String(port), '--no-clear', '--no-fork'],
    { cwd: PACKAGE_ROOT, env: { ...process.env, FORCE_COLOR: '0' } }
  )

  let output = ''
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk
  })
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk
  })

  // A killed parent must not leave a dev server holding the port.
  process.on('exit', () => child.kill('SIGKILL'))

  const listening = new RegExp(`localhost:${port}|Local: `)
  for (let attempt = 0; attempt < 240; attempt++) {
    if (listening.test(output)) break
    await sleep(500)
  }

  return {
    output: () => output,
    stop: async () => {
      child.kill('SIGTERM')
      await sleep(500)
    },
  }
}

/**
 * Milliseconds until `predicate` holds of `path`'s contents, or `null`.
 *
 * The clock starts when this is called, which is why callers that want to
 * compare two files must start both waits together rather than awaiting one and
 * then the other — a sequential pair measures the second from after the first
 * converged, and is not a comparison at all.
 */
export async function waitUntil(
  path: string,
  predicate: (source: string) => boolean,
  budgetMs = 30_000
): Promise<number | null> {
  const start = Date.now()

  for (;;) {
    if (predicate(await read(path))) return Date.now() - start
    if (Date.now() - start > budgetMs) return null
    await sleep(25)
  }
}
