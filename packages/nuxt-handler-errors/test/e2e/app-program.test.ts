import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertNoDiagnostics, compileFixture } from '../types/compile-harness'

// The map rendered through a real app's programs - the half the other suites
// defer. The claim is a *rendering* one on purpose: an unresolved
// `import("…")` inside a `.d.ts` produces no diagnostic under `skipLibCheck`
// (which every generated tsconfig sets) and silently becomes `any`, satisfying
// every structural assertion. The broken-specifier block at the bottom is that
// failure, induced.

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PLAYGROUND = join(PACKAGE_ROOT, 'playground')

/** Where the map lands - restated, not imported, for `generated-map`'s reason. */
const MAP_PATH = join(PLAYGROUND, '.nuxt/types/nuxt-handler-errors.d.ts')

// The probes live inside `.nuxt/`, a dot-directory TypeScript's wildcard
// expansion skips - invisible to `vue-tsc`, eslint and knip, reaching a
// program only as this harness's explicit root file.
const APP_PROBE = join(PLAYGROUND, '.nuxt/checked-app-probe.ts')
const SERVER_PROBE = join(PLAYGROUND, '.nuxt/checked-server-probe.ts')

const APP_TSCONFIG = join(PLAYGROUND, '.nuxt/tsconfig.json')
const SERVER_TSCONFIG = join(PLAYGROUND, '.nuxt/tsconfig.server.json')

/** The app program's call sites, as a consumer writes them. */
const APP_PROBE_SOURCE = [
  `import type { KnownApiErrors } from '@dphonys/nuxt-handler-errors/types'`,
  `import { useCheckedFetch } from '#imports'`,
  ``,
  `export type Entry = KnownApiErrors['/api/users/:id']['get']`,
  ``,
  `const fetched = await useCheckedFetch('/api/users/:id')`,
  `export type ComposableError = NonNullable<typeof fetched.error.value>['data']`,
  ``,
  `const tried = await $checkedFetch.try('/api/users/:id')`,
  `export type TryResult = typeof tried`,
  ``,
].join('\n')

// The server program's call site. The app probe cannot stand in for it: the
// app program types `H3Event` too, so a render there would say nothing about
// the program a handler author writes in.
const SERVER_PROBE_SOURCE = [
  `import { defineEventHandler } from 'h3'`,
  ``,
  `const probe = defineEventHandler(async (event) =>`,
  `  event.$checkedFetch.try('/api/users/:id'))`,
  ``,
  `export type EventTryResult = Awaited<ReturnType<typeof probe>>`,
  ``,
].join('\n')

/** The tags `/api/users/:id` really declares, in the playground. */
const DECLARED_TAGS = [
  'user-not-found',
  'user-suspended',
  'forbidden',
  'rate-limited',
]

beforeAll(() => {
  execFileSync(
    join(PACKAGE_ROOT, 'node_modules/.bin/nuxt'),
    ['prepare', PLAYGROUND],
    { cwd: PACKAGE_ROOT, stdio: 'pipe' }
  )

  writeFileSync(APP_PROBE, APP_PROBE_SOURCE)
  writeFileSync(SERVER_PROBE, SERVER_PROBE_SOURCE)
}, 300_000)

afterAll(() => {
  rmSync(APP_PROBE, { force: true })
  rmSync(SERVER_PROBE, { force: true })
})

describe('the map, rendered in the app program', () => {
  it('renders the entry flat, with this route’s real tags and payloads', () => {
    const compilation = compileFixture(APP_TSCONFIG, APP_PROBE)
    assertNoDiagnostics(compilation)

    const rendered = compilation.renderHover('Entry')

    for (const tag of DECLARED_TAGS) expect(rendered).toContain(`"${tag}"`)
    // The only place the emitter's own `Simplify<Serialize<…>>` is rendered
    // in a real app's program.
    expect(rendered).toContain(`requiredRole: "admin" | "owner"`)
    expect(rendered).toContain('retryAfter: number')
  })

  it('carries the union into the composable’s error ref', () => {
    const compilation = compileFixture(APP_TSCONFIG, APP_PROBE)
    const rendered = compilation.renderHover('ComposableError')

    for (const tag of DECLARED_TAGS) expect(rendered).toContain(`"${tag}"`)
  })

  it('gives `.try` two arms, with the union on the failing one', () => {
    const compilation = compileFixture(APP_TSCONFIG, APP_PROBE)
    const rendered = compilation.renderHover('TryResult')

    // The discriminated union: `if (error) return` narrows the sibling.
    expect(rendered).toContain('error: undefined')
    // The success arm is Nitro's own response type - plain, no `| undefined`.
    expect(rendered).toContain('email: string')

    for (const tag of DECLARED_TAGS) expect(rendered).toContain(`"${tag}"`)
  })
})

describe('the map, rendered in the server program', () => {
  it('carries the callee’s real tags into `event.$checkedFetch.try`', () => {
    const compilation = compileFixture(SERVER_TSCONFIG, SERVER_PROBE)
    assertNoDiagnostics(compilation)

    const rendered = compilation.renderHover('EventTryResult')

    for (const tag of DECLARED_TAGS) expect(rendered).toContain(`"${tag}"`)
  })
})

describe('the lookup, over a map whose specifiers resolve to nothing', () => {
  let original: string

  beforeAll(() => {
    original = readFileSync(MAP_PATH, 'utf8')

    // Every specifier in the map is relative to `.nuxt/types`, so redirecting
    // the one directory they all traverse points every one of them at nothing
    // - exactly what emitting the file one level too high would do.
    writeFileSync(
      MAP_PATH,
      original.replaceAll(`'../../server/`, `'../../nowhere/`)
    )
  })

  afterAll(() => {
    writeFileSync(MAP_PATH, original)
  })

  it('is swallowed whole: the probe still compiles clean', () => {
    assertNoDiagnostics(compileFixture(APP_TSCONFIG, APP_PROBE))
  })

  it('is caught by the rendering assertion, which is why one is used', () => {
    const compilation = compileFixture(APP_TSCONFIG, APP_PROBE)

    expect(() => compilation.renderHover('Entry')).toThrow(/`any`/)
  })
})
