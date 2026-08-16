import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

// The three published entries, resolved the way a consumer resolves them:
// through the package name, against the built `dist`. The playground is the
// only directory in the workspace with the package in its `node_modules`, and
// the build is a task dependency - see this package's `turbo.json`.

const run = promisify(execFile)

const PLAYGROUND = fileURLToPath(new URL('../../playground', import.meta.url))
const BUILT_MODULE = fileURLToPath(
  new URL('../../dist/module.mjs', import.meta.url)
)

const MODULE_ENTRY = '@dphonys/nuxt-handler-validation'
const TYPES_ENTRY = '@dphonys/nuxt-handler-validation/types'
const SERVER_ENTRY = '@dphonys/nuxt-handler-validation/server'

beforeAll(() => {
  if (existsSync(BUILT_MODULE)) return

  throw new Error(
    'No `dist` to resolve against. Run `pnpm run build` in this package, or ' +
      'run the suite through `turbo run test`, which builds it first.'
  )
})

/**
 * Compile one virtual file from inside the consumer's directory - rooted there
 * so TypeScript walks the same `node_modules` chain a consumer does - and
 * report what the compiler said.
 *
 * Plain bundler options rather than the playground's generated tsconfig:
 * `nuxt prepare` writes a `paths` entry mapping this package's subpaths
 * straight at `dist`, short-circuiting the very `exports` block under test.
 */
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
    // conditions the way a consumer's Nitro build will. `--input-type=module`
    // resolves bare specifiers against `cwd`, which is why it is the consumer's.
    const source = [MODULE_ENTRY, TYPES_ENTRY, SERVER_ENTRY]
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
    const failures = diagnosticsFor(
      [
        `import type { ModuleOptions } from '${MODULE_ENTRY}'`,
        `import type { MergedOutput, OutputOf, SourceSchemas, SourceValue, ValidatedContext, ValidationErrorData, ValidationIssue, ValidationSchemas, ValidationSource } from '${TYPES_ENTRY}'`,
        `import { defineValidatedEventHandler, recognizeValidationError } from '${SERVER_ENTRY}'`,
        `export type Probe = [ModuleOptions, ValidationSchemas, SourceSchemas, ValidationSource, ValidatedContext<ValidationSchemas>, SourceValue<SourceSchemas>, MergedOutput<readonly []>, OutputOf<SourceSchemas>, ValidationIssue, ValidationErrorData, typeof defineValidatedEventHandler, typeof recognizeValidationError]`,
      ].join('\n')
    )

    expect(failures).toEqual([])
  })

  it('publish none of v1’s composition vocabulary', () => {
    // Asserted from a consumer's seat, because a re-export left behind would be
    // public API this package would then owe a major to remove.
    const removed = [
      ['defineValidation', SERVER_ENTRY],
      ['ValidationFragment', TYPES_ENTRY],
      ['ValidationGroup', TYPES_ENTRY],
      ['ValidatedEventHandler', TYPES_ENTRY],
    ] as const

    for (const [name, entry] of removed) {
      const failures = diagnosticsFor(
        `import type { ${name} } from '${entry}'\nexport type Probe = ${name}`
      )

      expect(failures.join('\n')).toContain(`has no exported member '${name}'`)
    }
  })
})
