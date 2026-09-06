import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertNoDiagnostics, compileForHover } from '../types/compile-harness'
import type { Compilation, Diagnostic } from '../types/compile-harness'

// Both maps rendered through a real app's programs - the half `emitted-map`
// defers, and the only place the two slots are read the way a consumer reads
// them: off the file `nuxt prepare` wrote, through specifiers the app resolves
// on its own. The claims are *rendering* ones on purpose: an unresolved
// `import("…")` inside a `.d.ts` produces no diagnostic under `skipLibCheck`
// (which every generated tsconfig sets) and silently becomes `any`, satisfying
// every structural assertion. The broken-specifier block at the bottom is that
// failure, induced.

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PLAYGROUND = join(PACKAGE_ROOT, 'playground')

/** Where the map lands - restated, not imported, for `generated-map`'s reason. */
const MAP_PATH = join(PLAYGROUND, '.nuxt/types/nuxt-typed-handler.d.ts')

// The probes live inside `.nuxt/`, a dot-directory TypeScript's wildcard
// expansion skips - invisible to `vue-tsc`, eslint and knip, reaching a
// program only as this harness's explicit root file.
const APP_PROBE = join(PLAYGROUND, '.nuxt/typed-app-probe.ts')
const SERVER_PROBE = join(PLAYGROUND, '.nuxt/typed-server-probe.ts')

const APP_TSCONFIG = join(PLAYGROUND, '.nuxt/tsconfig.json')
const SERVER_TSCONFIG = join(PLAYGROUND, '.nuxt/tsconfig.server.json')

/** The app program's call sites, as a consumer writes them. */
const APP_PROBE_SOURCE = [
  `import type { KnownApiErrors } from '@dphonys/nuxt-handler-errors/types'`,
  `import type { KnownApiRequestInputs } from '@dphonys/nuxt-typed-handler/types'`,
  `import { useTypedFetch } from '#imports'`,
  ``,
  // The route declaring both halves: one key in each map, read one at a time.
  `export type BothErrors = KnownApiErrors['/api/users']['post']`,
  `export type BothInput = KnownApiRequestInputs['/api/users']['post']`,
  ``,
  // The `validate`-only route, whose query is composed from two schemas.
  `export type TupleQueryInput = KnownApiRequestInputs['/api/search']['get']`,
  `export type ValidateOnlyErrors = KnownApiErrors['/api/search']['get']`,
  ``,
  // Unbranded, and keyed anyway - what makes both lookups total.
  `export type UnbrandedErrors = KnownApiErrors['/api/legacy']['get']`,
  `export type UnbrandedInput = KnownApiRequestInputs['/api/legacy']['get']`,
  ``,
  `const fetched = await useTypedFetch('/api/users', {`,
  `  method: 'post',`,
  `  body: { name: 'Ada', email: 'ada@example.com' },`,
  `})`,
  `export type ComposableTags =`,
  `  NonNullable<NonNullable<typeof fetched.error.value>['data']>['data']['__knownError__']['tag']`,
  ``,
  `const tried = await $typedFetch.try('/api/users', {`,
  `  method: 'post',`,
  `  body: { name: 'Ada', email: 'ada@example.com' },`,
  `})`,
  `export type TryResult = typeof tried`,
  ``,
  // The tag union, extracted: `TryResult` renders the two arms but stops at
  // the emitter's own `Simplify<Serialize<…>>` alias, which says nothing
  // about what is inside it.
  `export type TryTags =`,
  `  NonNullable<NonNullable<typeof tried.error>['data']>['data']['__knownError__']['tag']`,
  ``,
].join('\n')

// The server program's call site. The app probe cannot stand in for it: the
// app program types `H3Event` too, so a render there would say nothing about
// the program a handler author writes in.
const SERVER_PROBE_SOURCE = [
  `import { defineEventHandler } from 'h3'`,
  ``,
  `const probe = defineEventHandler(async (event) =>`,
  `  event.$typedFetch.try('/api/users', {`,
  `    method: 'post',`,
  `    body: { name: 'Ada', email: 'ada@example.com' },`,
  `  }))`,
  ``,
  `const tried = await probe({} as never)`,
  `export type EventTryTags =`,
  `  NonNullable<NonNullable<typeof tried.error>['data']>['data']['__knownError__']['tag']`,
  ``,
].join('\n')

/** The playground's own compiler-asserted call sites, over the same map. */
const REQUEST_TYPING_CHECK = join(PLAYGROUND, 'request-typing.check.ts')

/** TS2578 - "Unused '@ts-expect-error' directive". */
const UNUSED_TS_EXPECT_ERROR = 2578

/** What `/api/users` on `post` really declares, in the playground. */
const DECLARED_TAGS = ['userExists', 'validationFailed']

/**
 * One file's own diagnostics out of the app program. The harness's
 * `assertNoDiagnostics` speaks for the whole program, which is the right
 * reading while the map is intact and the wrong one once it is broken on
 * purpose: the breakage is meant to reach the app's call sites.
 */
function diagnosticsOf(file: string): readonly Diagnostic[] {
  return appProgram().diagnostics.filter(
    (one) => one.fileName === file.replaceAll('\\', '/')
  )
}

/** The app program, rooted at the probe. Recompiled per call: the last block
 * rewrites the map underneath it, so a cached one would answer for the wrong
 * state of the file. */
function appProgram(): Compilation {
  return compileForHover(APP_TSCONFIG, APP_PROBE)
}

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

describe('both maps, rendered in the app program', () => {
  // `vue-tsc` covers the app's `.vue` files under `pnpm typecheck`; a
  // TypeScript program does not read them, so this speaks for the `.ts` half
  // of the app plus the probe.
  it('typechecks the app program the probe is rooted in', () => {
    assertNoDiagnostics(appProgram())
  })

  it('reads the errors slot serialised, with this route’s real tags', () => {
    const rendered = appProgram().renderHover('BothErrors')

    for (const tag of DECLARED_TAGS) expect(rendered).toContain(`"${tag}"`)
    expect(rendered).toContain('email: string')
    // The built-in variant's own shape, carried by the declaring wrapper.
    expect(rendered).toContain('status: 400')
  })

  it('reads the request-inputs slot with no Serialize at all', () => {
    const compilation = appProgram()

    expect(compilation.renderHover('BothInput')).toContain('body:')
    expect(compilation.renderHover('BothInput')).toContain('name: string')

    // The input side of a composed query: `page` before its transform to
    // `number`, intersected with the second element's optional key.
    const tupled = compilation.renderHover('TupleQueryInput')

    expect(tupled).toContain('query:')
    expect(tupled).toContain('page: string')
    expect(tupled).toContain('sort?:')
  })

  it('keeps each map to its own slot, on the route that declares both', () => {
    const compilation = appProgram()

    // The failure this catches is one slot's extractor emitted under the
    // other's interface - which type-checks, and is silently wrong.
    expect(compilation.renderHover('BothErrors')).not.toContain('body:')
    expect(compilation.renderHover('BothInput')).not.toContain('tag:')
  })

  it('answers a `validate`-only route with the built-in variant alone', () => {
    const rendered = appProgram().renderHover('ValidateOnlyErrors')

    expect(rendered).toContain('"validationFailed"')
    expect(rendered).not.toContain('"userExists"')
  })

  it('extracts nothing from an unbranded route in either map', () => {
    const compilation = appProgram()

    expect(compilation.renderHover('UnbrandedErrors')).toBe('never')
    expect(compilation.renderHover('UnbrandedInput')).toBe('never')
  })

  it('carries the union into the composable’s error ref', () => {
    const rendered = appProgram().renderHover('ComposableTags')

    for (const tag of DECLARED_TAGS) expect(rendered).toContain(`"${tag}"`)
  })

  it('gives `.try` two arms, with the union on the failing one', () => {
    const rendered = appProgram().renderHover('TryResult')

    // The discriminated union: `if (error) return` narrows the sibling.
    expect(rendered).toContain('error: undefined')
    // The success arm is Nitro's own response type - plain, no `| undefined`.
    expect(rendered).toContain('created: string')
  })

  it('types the failing arm from this route’s two declared tags', () => {
    const rendered = appProgram().renderHover('TryTags')

    for (const tag of DECLARED_TAGS) expect(rendered).toContain(`"${tag}"`)
  })
})

describe('both maps, rendered in the server program', () => {
  it('typechecks the server program, the probe included', () => {
    assertNoDiagnostics(compileForHover(SERVER_TSCONFIG, SERVER_PROBE))
  })

  it('carries the callee’s real tags into `event.$typedFetch.try`', () => {
    const rendered = compileForHover(SERVER_TSCONFIG, SERVER_PROBE).renderHover(
      'EventTryTags'
    )

    for (const tag of DECLARED_TAGS) expect(rendered).toContain(`"${tag}"`)
  })
})

describe('the lookup, over a map whose specifiers resolve to nothing', () => {
  let original: string

  beforeAll(() => {
    original = readFileSync(MAP_PATH, 'utf8')

    // Every handler specifier in the map is relative to `.nuxt/types`, so
    // redirecting the one directory they all traverse points every one of
    // them at nothing - exactly what emitting the file one level too high
    // would do.
    writeFileSync(
      MAP_PATH,
      original.replaceAll(`'../../server/`, `'../../nowhere/`)
    )
  })

  afterAll(() => {
    writeFileSync(MAP_PATH, original)
  })

  it('is swallowed whole: the probe still compiles clean', () => {
    // The probe's own diagnostics, not the program's: the app's compiler-
    // asserted call sites do notice, and the next case is that claim.
    expect(diagnosticsOf(APP_PROBE)).toEqual([])
  })

  it('is caught by the rendering assertion, which is why one is used', () => {
    const compilation = appProgram()

    expect(() => compilation.renderHover('BothErrors')).toThrow(/`any`/)
    expect(() => compilation.renderHover('BothInput')).toThrow(/`any`/)
  })

  it('takes the playground’s re-pointed request-typing rows down with it', () => {
    // Those rows read this same file, so a map that resolves to nothing turns
    // every `@ts-expect-error` in them into an unused directive (TS2578).
    expect(
      diagnosticsOf(REQUEST_TYPING_CHECK).map((one) => one.code)
    ).toContain(UNUSED_TS_EXPECT_ERROR)
  })
})
