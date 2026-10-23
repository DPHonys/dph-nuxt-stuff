import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

// The four public entries, resolved the way a consumer resolves them: through
// the package name, against the built `dist`. The playground is the only
// directory in the workspace with the package in its `node_modules`, and the
// build is a task dependency of `test` in the root `turbo.json`.

const run = promisify(execFile)

const PLAYGROUND = fileURLToPath(new URL('../../playground', import.meta.url))
const BUILT_MODULE = fileURLToPath(
  new URL('../../dist/module.mjs', import.meta.url)
)

const ENTRIES = [
  '@dphonys/better-handler',
  '@dphonys/better-handler/types',
  '@dphonys/better-handler/server',
  '@dphonys/better-handler/shared',
] as const

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
 * `nuxt prepare` may map this package's subpaths straight at `dist`,
 * short-circuiting the very `exports` block under test.
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
    const source = ENTRIES.map(
      (specifier) => `await import(${JSON.stringify(specifier)})`
    ).join('\n')

    await expect(
      run(process.execPath, ['--input-type=module', '--eval', source], {
        cwd: PLAYGROUND,
      })
    ).resolves.toBeDefined()
  })

  it('all resolve for types', () => {
    const failures = diagnosticsFor(
      [
        ...ENTRIES.map(
          (specifier, index) =>
            `import * as entry${index} from ${JSON.stringify(specifier)}`
        ),
        `import type { ModuleOptions } from '${ENTRIES[0]}'`,
        `export type Probe = [ModuleOptions, ${ENTRIES.map((_, index) => `typeof entry${index}`).join(', ')}]`,
      ].join('\n')
    )

    expect(failures).toEqual([])
  })

  it('publish no `internals` door', async () => {
    // The old packages' `/internals/*` entries were a semi-public surface;
    // this package has none, at runtime or for types.
    await expect(
      run(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `await import('@dphonys/better-handler/internals/server')`,
        ],
        { cwd: PLAYGROUND }
      )
    ).rejects.toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED/)

    expect(
      diagnosticsFor(
        `import * as probe from '@dphonys/better-handler/internals/server'\nexport type Probe = typeof probe`
      ).join('\n')
    ).toContain('TS2307')
  })
})
