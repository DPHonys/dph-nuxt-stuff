import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

// The generated type map augments `@dphonys/better-handler/types` from inside
// `.nuxt`, so that specifier has to reach the types entry under every tsconfig
// `nuxt prepare` writes. If one of them resolves it elsewhere, the augmentation
// lands on the wrong file and nothing reports it. Nuxt 4.0.x is where this
// bites: its `typescript.hoist` maps a scoped subpath such as this one to the
// package root, which TypeScript then reads as the module entry. CI runs this
// file against 4.0.x as well as the latest 4.x.

const run = promisify(execFile)

const PLAYGROUND = fileURLToPath(new URL('../../playground', import.meta.url))
const BUILD_DIR = join(PLAYGROUND, '.nuxt')
const TYPES_ENTRY = fileURLToPath(
  new URL('../../dist/runtime/types/index.d.ts', import.meta.url)
)

/** The `nuxt` CLI of the Nuxt this suite is installed against. */
function nuxtCli(): string {
  const manifestPath = createRequire(import.meta.url).resolve(
    'nuxt/package.json'
  )
  // SAFETY: every `nuxt` manifest this suite installs against (4.0.x, the
  // latest 4.x and the `nuxt-nightly` alias) maps `bin.nuxt` to its CLI.
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    bin: { nuxt: string }
  }
  return join(dirname(manifestPath), manifest.bin.nuxt)
}

/** Where TypeScript resolves `specifier` from `.nuxt/types` under `tsconfig`. */
function resolveFromBuildDir(tsconfig: string, specifier: string) {
  const { config, error } = ts.readConfigFile(tsconfig, ts.sys.readFile)
  if (error)
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, ' '))
  const { options } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    dirname(tsconfig)
  )

  return ts.resolveModuleName(
    specifier,
    join(BUILD_DIR, 'types', 'resolution.probe.d.ts'),
    options,
    ts.sys
  ).resolvedModule?.resolvedFileName
}

beforeAll(async () => {
  if (!existsSync(TYPES_ENTRY)) {
    throw new Error(
      'No `dist` to resolve against. Run `pnpm run build` in this package, or ' +
        'run the suite through `turbo run test`, which builds it first.'
    )
  }

  // What a consumer's `postinstall` runs: every tsconfig below is its output.
  await run(process.execPath, [nuxtCli(), 'prepare', PLAYGROUND], {
    cwd: PLAYGROUND,
  })
})

describe('the tsconfigs `nuxt prepare` generates', () => {
  it('include the root and the server tsconfig', () => {
    // Guards the next test against passing over an empty directory.
    expect(readdirSync(BUILD_DIR)).toEqual(
      expect.arrayContaining(['tsconfig.json', 'tsconfig.server.json'])
    )
  })

  it('each resolve `@dphonys/better-handler/types` to the types entry', () => {
    const tsconfigs = readdirSync(BUILD_DIR).filter((name) =>
      /^tsconfig(?:\.\w+)?\.json$/.test(name)
    )

    const resolved = Object.fromEntries(
      tsconfigs.map((name) => {
        const file = resolveFromBuildDir(
          join(BUILD_DIR, name),
          '@dphonys/better-handler/types'
        )
        return [name, file && realpathSync(file)]
      })
    )

    expect(resolved).toEqual(
      Object.fromEntries(
        tsconfigs.map((name) => [name, realpathSync(TYPES_ENTRY)])
      )
    )
  })
})
