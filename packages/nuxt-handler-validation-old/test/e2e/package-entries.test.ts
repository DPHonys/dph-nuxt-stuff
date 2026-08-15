import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The three published entries, resolved the way a consumer resolves them:
 * through the package name, against the built `dist`. The playground is the
 * only directory in the workspace with `@dphonys/nuxt-handler-validation-old` in
 * its `node_modules`, which is what makes it the consumer's seat here.
 *
 * Both halves matter and neither implies the other: `exports` can point at a
 * file that does not exist (runtime), and the `types` condition can point
 * somewhere else entirely (types).
 *
 * The build is a task dependency, not something this suite performs - see this
 * package's `turbo.json`.
 */

const run = promisify(execFile)

const PLAYGROUND = fileURLToPath(new URL('../../playground', import.meta.url))
const BUILT_MODULE = fileURLToPath(
  new URL('../../dist/module.mjs', import.meta.url)
)

const MODULE_ENTRY = '@dphonys/nuxt-handler-validation-old'
const TYPES_ENTRY = '@dphonys/nuxt-handler-validation-old/types'
const SERVER_ENTRY = '@dphonys/nuxt-handler-validation-old/server'

beforeAll(() => {
  if (existsSync(BUILT_MODULE)) return

  throw new Error(
    'No `dist` to resolve against. Run `pnpm run build` in this package, or ' +
      'run the suite through `turbo run test`, which builds it first.'
  )
})

describe('the published entries', () => {
  it('all import at runtime from a consumer’s node_modules', async () => {
    // A real Node process, not Vite's resolver: `exports` conditions are what
    // is under test, and only Node applies them the way a consumer's Nitro
    // build will. `--input-type=module` resolves bare specifiers against the
    // working directory, which is why `cwd` is the consumer's.
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
    // Rooted at a path inside the consumer's directory so TypeScript walks the
    // same `node_modules` chain a consumer does. The file is virtual: module
    // resolution needs its path, not its presence on disk.
    //
    // Plain bundler options rather than the playground's generated tsconfig,
    // on purpose: `nuxt prepare` writes a `paths` entry mapping this package's
    // subpaths straight at `dist`, which short-circuits the very `exports`
    // block under test. An installed consumer has no such mapping.
    //
    // Each name is imported from the entry that owns it, so a broken re-export
    // on one door cannot be covered by another.
    const probe = `${PLAYGROUND}/__entry-resolution.probe.ts`
    const source = [
      `import type { ModuleOptions } from '${MODULE_ENTRY}'`,
      `import type { ValidateSchemas, ValidatedEventHandler, ValidationErrorData, ValidationFragment, ValidationGroup, ValidationIssue } from '${TYPES_ENTRY}'`,
      `import { defineValidatedEventHandler, defineValidation, recognizeValidationError } from '${SERVER_ENTRY}'`,
      `export type Probe = [ModuleOptions, ValidateSchemas, ValidatedEventHandler, ValidationErrorData, ValidationFragment, ValidationGroup<ValidationFragment>, ValidationIssue, typeof defineValidatedEventHandler, typeof defineValidation, typeof recognizeValidationError]`,
    ].join('\n')

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

    const failures = ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file?.fileName === probe)
      .map(
        (diagnostic) =>
          `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
      )

    expect(failures).toEqual([])
  })
})
