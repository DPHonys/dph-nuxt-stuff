import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

// Resolved the way a consumer resolves them: through the package name, from
// the playground - the one workspace directory with the package in
// `node_modules`. The build is a task dependency - see `turbo.json`.

const run = promisify(execFile)

const PLAYGROUND = fileURLToPath(new URL('../../playground', import.meta.url))
const BUILT_MODULE = fileURLToPath(
  new URL('../../dist/module.mjs', import.meta.url)
)

const MODULE_ENTRY = '@dphonys/nuxt-typed-handler'
const TYPES_ENTRY = '@dphonys/nuxt-typed-handler/types'
const SERVER_ENTRY = '@dphonys/nuxt-typed-handler/server'
const SHARED_ENTRY = '@dphonys/nuxt-typed-handler/shared'

const PUBLIC_ENTRIES = [
  MODULE_ENTRY,
  TYPES_ENTRY,
  SERVER_ENTRY,
  SHARED_ENTRY,
] as const

/** The umbrella is the leaf: none of these may resolve on it. */
const INTERNALS_SUBPATHS = ['build', 'server', 'shared', 'app'] as const

/**
 * Every name the parents publish only through their internals. None may be
 * reachable through an umbrella door, runtime or type.
 */
const PARENT_INTERNALS = {
  runtime: [
    // errors `/internals/build`
    'addChannelStripErrorHandler',
    'addChannelToken',
    'emitMap',
    'EMPTY_MAP',
    'emptyMap',
    'KNOWN_ERRORS_SLOT',
    'normalizeChannelToken',
    'TYPES_SPECIFIER',
    'warnCustomErrorHandler',
    // errors `/internals/server`
    'createCheckedEventFetch',
    'createChannelStripHandler',
    'createErrorContext',
    'createKnownError',
    'EventFetchUnavailableError',
    'finalizeError',
    'resolveDeclared',
    // errors `/internals/shared`
    'CHANNEL_HEADER',
    'createCheckedFetch',
    'knownErrorMarker',
    'lazyGlobalFetch',
    'readFloor',
    'toNuxtError',
    'toTryResult',
    // errors `/internals/app`
    'wrapVanillaAsyncData',
    'wrapVanillaFetch',
    // validation `/internals/server`
    'raiseValidationError',
    'sourcePlan',
    'validatedContext',
    // validation `/internals/shared`
    'markValidationError',
    'readValidationMarker',
    'VALIDATION_ERROR_KEY',
  ],
  types: [
    'EmitMapOptions',
    'EmitMapSlot',
    'NitroPathOptions',
    'SlotImport',
    'DeclaredError',
    'RawEventFetch',
    'CheckedFetchFactoryOptions',
    'RawFetch',
    'RawOptions',
    'RawTryResult',
    'FailureOf',
    'FetchWrapperOptions',
    'KnownErrorRef',
    'RawUseAsyncData',
    'RawUseFetch',
    'SuccessOf',
    'TrySource',
    'UseCheckedAsyncData',
    'UseCheckedFetch',
    'OnInvalid',
    'SourcePlan',
    'ValidatedContextOptions',
  ],
} as const

/**
 * The umbrella's own private helpers - the aliases `/types` is built from,
 * named by §6.1 as not exported. None may be reachable through its door.
 */
const TYPES_PRIVATE = [
  'BodyOption',
  'ComputedOptions',
  'Declared',
  'DefaultMethod',
  'HasErrors',
  'HasValidate',
  'InputFor',
  'MethodArg',
  'QueryOption',
  'ReactiveSources',
  'Resp',
  'TypedSources',
  'Vanilla',
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
  // Forward slashes, since TypeScript normalizes the names it hands back.
  const probe = `${PLAYGROUND}/__entry-resolution.probe.ts`.replaceAll(
    '\\',
    '/'
  )

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

/** TS2305 or, when a near-miss exists on the door, TS2724's "named". */
function notExported(name: string): RegExp {
  return new RegExp(`has no exported member (?:named )?'${name}'`)
}

/** A real Node process from the consumer's seat - only Node applies `exports`. */
function importFromPlayground(specifier: string) {
  return run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(specifier)})`,
    ],
    { cwd: PLAYGROUND }
  )
}

describe('the published entries', () => {
  it('all import at runtime from a consumer’s node_modules', async () => {
    for (const entry of PUBLIC_ENTRIES) {
      await expect(importFromPlayground(entry)).resolves.toBeDefined()
    }
  })

  it('all resolve for types, each through its own door', () => {
    // Each name is imported from the entry that owns it: every umbrella-owned
    // name, plus re-exported parent names - at least one per parent per door.
    const probes = [
      `import type { ModuleOptions } from '${MODULE_ENTRY}'`,
      `import type { AtLeastOne, DefineTypedEventHandler, ReservedTagGuard, TypedContext, TypedErrors, TypedEventHandler, TypedHandlerFn, ValidationFailed } from '${TYPES_ENTRY}'`,
      `import type { $TypedFetch, KnownApiRequestInputs, RequestInputOfRoute, TypedEventFetch, TypedFetch, TypedFetchTry, TypedRequestOptions } from '${TYPES_ENTRY}'`,
      `import type { AnyKnownError, CheckedEventHandler, ErrorFactories, KnownApiErrors, KnownErrorsOf, KnownErrorsOfHandler, KnownErrorsOfRoute, KnownVariant, TryResult } from '${TYPES_ENTRY}'`,
      `import type { RequestInput, RequestInputOfHandler, ValidatedContext, ValidatedEventHandler, ValidationIssue, ValidationSchemas, ValidationSchemasGuard } from '${TYPES_ENTRY}'`,
      `import { defineTypedEventHandler, defineError, recognizeKnownError, recognizeValidationError } from '${SERVER_ENTRY}'`,
      `import { KNOWN_ERROR_KEY, matchError } from '${SHARED_ENTRY}'`,
      `export type Probe = [ModuleOptions, AtLeastOne<{}, []>, DefineTypedEventHandler, ReservedTagGuard<[]>, TypedContext<{}, []>, TypedErrors<{}, []>, TypedEventHandler, TypedHandlerFn<{}, [], never, unknown>, ValidationFailed, AnyKnownError, CheckedEventHandler, ErrorFactories<[]>, KnownApiErrors, KnownErrorsOf<[]>, KnownErrorsOfHandler<never>, KnownErrorsOfRoute<'/api/users/:id'>, KnownVariant, TryResult<unknown, Error>, RequestInput<{}>, RequestInputOfHandler<never>, ValidatedContext<{}>, ValidatedEventHandler, ValidationIssue, ValidationSchemas, ValidationSchemasGuard<{}>, typeof defineTypedEventHandler, typeof defineError, typeof recognizeKnownError, typeof recognizeValidationError, typeof KNOWN_ERROR_KEY, typeof matchError, $TypedFetch, KnownApiRequestInputs, RequestInputOfRoute<'/api/users/:id'>, TypedEventFetch, TypedFetch, TypedFetchTry, TypedRequestOptions<'/api/users/:id', 'get'>]`,
    ]

    expect(diagnosticsFor(probes.join('\n'))).toEqual([])
  })

  it('retains transforming schema inputs separately from flat outputs', () => {
    expect(
      diagnosticsFor(
        [
          `import { defineError, defineTypedEventHandler } from '${SERVER_ENTRY}'`,
          `import type { ErrorFactories, KnownErrorsOfHandler } from '${TYPES_ENTRY}'`,
          `import { z } from 'zod'`,
          `type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false`,
          `type Expect<T extends true> = T`,
          `const errors = defineError({ expired: { status: 410, payload: z.string().transform(value => ({ until: new Date(value) })) } })`,
          `type _input = Expect<Equal<Parameters<ErrorFactories<typeof errors>['expired']>, [payload: string]>>`,
          `const handler = defineTypedEventHandler({ errors }, (_event, { errors }) => {`,
          `  errors.expired('2026-01-01')`,
          `  // @ts-expect-error factories accept schema input, not output`,
          `  errors.expired({ until: new Date() })`,
          `  return null`,
          `})`,
          `type Output = KnownErrorsOfHandler<typeof handler>`,
          `type _output = Expect<Equal<{ [K in keyof Output]: Output[K] }, { tag: 'expired', status: 410, until: Date }>>`,
        ].join('\n')
      )
    ).toEqual([])
  })

  it('keeps the request-typing helpers off the `/types` door', () => {
    // Every alias `TypedRequestOptions` and the composable signatures are
    // built from: implementation detail, and each one a name a consumer would
    // reasonably expect to be able to bind a route to.
    const failures = diagnosticsFor(
      `import type { ${TYPES_PRIVATE.join(', ')} } from '${TYPES_ENTRY}'`
    ).join('\n')

    for (const name of TYPES_PRIVATE) {
      expect(failures).toMatch(notExported(name))
    }
  })

  it('keep the parents’ wrappers off every door', () => {
    for (const door of PUBLIC_ENTRIES) {
      const failures = diagnosticsFor(
        `import { defineCheckedEventHandler, defineValidatedEventHandler } from '${door}'`
      ).join('\n')

      for (const name of [
        'defineCheckedEventHandler',
        'defineValidatedEventHandler',
      ]) {
        expect(failures).toMatch(notExported(name))
      }
    }
  })

  it('keep every parent internal off every door', () => {
    // The whole parents' internals contract against every umbrella door, types
    // included, so a seam cannot leak through the door nobody listed it for.
    for (const door of PUBLIC_ENTRIES) {
      const failures = diagnosticsFor(
        [
          `import { ${PARENT_INTERNALS.runtime.join(', ')} } from '${door}'`,
          `import type { ${PARENT_INTERNALS.types.join(', ')} } from '${door}'`,
        ].join('\n')
      ).join('\n')

      for (const name of [
        ...PARENT_INTERNALS.runtime,
        ...PARENT_INTERNALS.types,
      ]) {
        expect(failures).toMatch(notExported(name))
      }
    }
  })

  it('expose no `/internals/*` specifier of its own, for runtime or types', async () => {
    for (const subpath of INTERNALS_SUBPATHS) {
      const specifier = `${MODULE_ENTRY}/internals/${subpath}`

      await expect(importFromPlayground(specifier)).rejects.toThrow(
        'ERR_PACKAGE_PATH_NOT_EXPORTED'
      )

      // A namespace import, not a bare one: an unresolved side-effect import
      // is no diagnostic at all under the compiler's defaults.
      expect(
        diagnosticsFor(
          `import * as probe from '${specifier}'\nexport const p = probe`
        ).join('\n')
      ).toContain(`Cannot find module '${specifier}'`)
    }
  })
})
