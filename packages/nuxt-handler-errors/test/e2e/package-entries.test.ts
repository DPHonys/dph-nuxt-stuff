import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

// Resolved the way a consumer resolves them: through the package name, from
// the playground - the one workspace directory with the package in `node_modules`.

const run = promisify(execFile)

const PLAYGROUND = fileURLToPath(new URL('../../playground', import.meta.url))
const BUILT_MODULE = fileURLToPath(
  new URL('../../dist/module.mjs', import.meta.url)
)

const MODULE_ENTRY = '@dphonys/nuxt-handler-errors'
const TYPES_ENTRY = '@dphonys/nuxt-handler-errors/types'
const SERVER_ENTRY = '@dphonys/nuxt-handler-errors/server'
const SHARED_ENTRY = '@dphonys/nuxt-handler-errors/shared'
const INTERNALS_BUILD_ENTRY = '@dphonys/nuxt-handler-errors/internals/build'
const INTERNALS_SERVER_ENTRY = '@dphonys/nuxt-handler-errors/internals/server'
const INTERNALS_SHARED_ENTRY = '@dphonys/nuxt-handler-errors/internals/shared'
const INTERNALS_APP_ENTRY = '@dphonys/nuxt-handler-errors/internals/app'

// The full published internals contract, per entry. Both the positive probe
// (each name resolves through its own door) and the boundary check (no name
// resolves through a public door) derive from it, so a new seam cannot be
// added without being covered by both.
const INTERNALS = [
  {
    entry: INTERNALS_BUILD_ENTRY,
    runtime: [
      'addChannelStripErrorHandler',
      'addChannelToken',
      'emitMap',
      'EMPTY_MAP',
      'emptyMap',
      'KNOWN_ERRORS_SLOT',
      'normalizeChannelToken',
      'TYPES_SPECIFIER',
      'warnCustomErrorHandler',
    ],
    types: ['EmitMapOptions', 'EmitMapSlot', 'NitroPathOptions', 'SlotImport'],
  },
  {
    entry: INTERNALS_SERVER_ENTRY,
    runtime: [
      'createCheckedEventFetch',
      'createChannelStripHandler',
      'createFail',
      'createKnownError',
      'EventFetchUnavailableError',
      'raiseKnown',
      'resolveDeclared',
    ],
    types: ['DeclaredError', 'RawEventFetch'],
  },
  {
    entry: INTERNALS_SHARED_ENTRY,
    runtime: [
      'CHANNEL_HEADER',
      'createCheckedFetch',
      'knownErrorMarker',
      'lazyGlobalFetch',
      'readFloor',
      'toNuxtError',
      'toTryResult',
    ],
    types: [
      'CheckedFetchFactoryOptions',
      'RawFetch',
      'RawOptions',
      'RawTryResult',
    ],
  },
  {
    entry: INTERNALS_APP_ENTRY,
    runtime: ['wrapVanillaAsyncData', 'wrapVanillaFetch'],
    types: [
      'FailureOf',
      'FetchWrapperOptions',
      'KnownErrorRef',
      'RawUseAsyncData',
      'RawUseFetch',
      'SuccessOf',
      'TrySource',
      'UseCheckedAsyncData',
      'UseCheckedFetch',
    ],
  },
] as const

beforeAll(() => {
  if (existsSync(BUILT_MODULE)) return

  throw new Error(
    'No `dist` to resolve against. Run `pnpm run build` in this package, or ' +
      'run the suite through `turbo run test`, which builds it first.'
  )
})

// Plain bundler options rather than the playground's generated tsconfig: its
// `paths` map this package's subpaths straight at `dist`, short-circuiting
// the very `exports` block under test.
function diagnosticsFor(source: string): string[] {
  const probe = `${PLAYGROUND}/__entry-resolution.probe.ts`

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  }

  const host = ts.createCompilerHost(options, true)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)

  host.readFile = (name) => (name === probe ? source : readFile(name))
  host.fileExists = (name) => name === probe || fileExists(name)
  host.getSourceFile = (name, ...rest) =>
    name === probe
      ? ts.createSourceFile(probe, source, ts.ScriptTarget.ESNext, true)
      : getSourceFile(name, ...rest)

  const program = ts.createProgram([probe], options, host)

  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === probe)
    .map(
      (diagnostic) =>
        `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
    )
}

describe('the published entries', () => {
  it('all import at runtime from a consumer’s node_modules', async () => {
    // A real Node process, not Vite's resolver: only Node applies `exports`
    // conditions the way a consumer's Nitro build will.
    // `/internals/app` is absent on purpose: it imports `#app`, which exists
    // only inside a Nuxt build. The types probe below covers its wiring.
    const source = [
      MODULE_ENTRY,
      TYPES_ENTRY,
      SERVER_ENTRY,
      SHARED_ENTRY,
      INTERNALS_BUILD_ENTRY,
      INTERNALS_SERVER_ENTRY,
      INTERNALS_SHARED_ENTRY,
    ]
      .map((specifier) => `await import(${JSON.stringify(specifier)})`)
      .join('\n')

    await expect(
      run(process.execPath, ['--input-type=module', '--eval', source], {
        cwd: PLAYGROUND,
      })
    ).resolves.toBeDefined()
  })

  it('all resolve for types, each through its own door', () => {
    // Each name is imported from the entry that owns it, so a broken re-export
    // on one door cannot be covered by another.
    const probes = [
      `import type { ModuleOptions } from '${MODULE_ENTRY}'`,
      `import type { $CheckedFetch, CheckedEventHandler, CheckedFetch, Fail, Fallback, KnownApiErrors, KnownError, KnownErrorBody, KnownErrorCarrier, KnownErrorFor, KnownErrorGroup, KnownErrorKey, KnownErrorsOf, KnownErrorsOfHandler, KnownErrorsOfRoute, KnownVariant, TryResult, VariantsOf } from '${TYPES_ENTRY}'`,
      `import { defineCheckedEventHandler, defineError, payload, recognizeKnownError } from '${SERVER_ENTRY}'`,
      `import { KNOWN_ERROR_KEY, matchError } from '${SHARED_ENTRY}'`,
      ...INTERNALS.flatMap(({ entry, runtime, types }) => [
        `import { ${runtime.join(', ')} } from '${entry}'`,
        `import type { ${types.join(', ')} } from '${entry}'`,
      ]),
      `export type Probe = [ModuleOptions, $CheckedFetch, CheckedEventHandler, CheckedFetch, Fail<never>, Fallback, KnownApiErrors, KnownError<never>, KnownErrorBody<KnownVariant>, KnownErrorCarrier<KnownVariant>, KnownErrorFor<'/api/users/:id', 'get'>, KnownErrorGroup<KnownVariant>, KnownErrorKey, KnownErrorsOf<never>, KnownErrorsOfHandler<never>, KnownErrorsOfRoute<'/api/users/:id'>, KnownVariant, TryResult<unknown, Error>, VariantsOf<never>, typeof defineCheckedEventHandler, typeof defineError, typeof payload, typeof recognizeKnownError, typeof KNOWN_ERROR_KEY, typeof matchError, ${INTERNALS.flatMap(({ runtime }) => runtime.map((name) => `typeof ${name}`)).join(', ')}, EmitMapOptions, EmitMapSlot, NitroPathOptions, SlotImport, DeclaredError, RawEventFetch, CheckedFetchFactoryOptions, RawFetch, RawOptions, RawTryResult, FetchWrapperOptions, KnownErrorRef<'/api/users/:id', 'get'>, RawUseFetch, UseCheckedFetch, FailureOf<TrySource>, RawUseAsyncData, SuccessOf<TrySource>, TrySource, UseCheckedAsyncData]`,
    ]

    expect(diagnosticsFor(probes.join('\n'))).toEqual([])
  })

  it('keep the internals off the public doors', () => {
    // Asserted from a consumer's seat: a seam leaking onto a public entry
    // would be public API this package would then owe a major to remove.
    const publicDoors = [
      MODULE_ENTRY,
      TYPES_ENTRY,
      SERVER_ENTRY,
      SHARED_ENTRY,
    ] as const

    // The whole contract against every door, types included, so a seam
    // cannot leak through the door nobody thought to list for it.
    const runtime = INTERNALS.flatMap((entry) => entry.runtime)
    const types = INTERNALS.flatMap((entry) => entry.types)

    for (const door of publicDoors) {
      const failures = diagnosticsFor(
        [
          `import { ${runtime.join(', ')} } from '${door}'`,
          `import type { ${types.join(', ')} } from '${door}'`,
        ].join('\n')
      ).join('\n')

      // TS2305 reads `has no exported member 'X'`; TS2724 reads `has no
      // exported member named 'X'` when a public name is close enough to
      // suggest. Both mean the seam is absent.
      for (const name of [...runtime, ...types]) {
        expect(failures).toMatch(
          new RegExp(`has no exported member (named )?'${name}'`)
        )
      }
    }
  })
})
