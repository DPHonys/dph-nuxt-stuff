import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileInApp } from '../types/compile-harness'
import type { Diagnostic } from '../types/compile-harness'

// The native slot as an app sees it: `test/fixtures/native` prepared on
// Nitro's route types, which is every Nuxt 4 with `experimental.routeTypedFetch`
// off, and, on Nuxt 4.6 and later, with the generated route engine the flag
// turns on. Its checks are compiled in each app's own program, against the
// package's built declarations, which the app resolves through the package's
// `exports` as a consumer's does.
//
// The generated engine and the extractor that reads the slot exist only from
// Nuxt 4.6, so everything that needs them is skipped below it: the slot is
// the one additive layer the package has on 4.6, and nothing else here is
// version-conditional.

const run = promisify(execFile)

const FIXTURE = fileURLToPath(new URL('../fixtures/native', import.meta.url))
const BUILT_SERVER_ENTRY = fileURLToPath(
  new URL('../../dist/runtime/server/index.d.ts', import.meta.url)
)

/** Each engine's build directory, as the fixture's `nuxt.config.ts` names it. */
const INTERNAL_API = join(FIXTURE, '.nuxt/internal-api')
const GENERATED = join(FIXTURE, '.nuxt/generated')

const NATIVE_CHECK = join(FIXTURE, 'checks/native.ts')
const AGREEMENT_CHECK = join(FIXTURE, 'checks/agreement.spec-d.ts')
const BETTER_FETCH_CHECK = join(FIXTURE, 'checks/better-fetch.ts')

/** What marks a call the generated engine must refuse, at the end of its line. */
const REFUSED = '// refused natively'

/** What marks a call the fetch family must refuse, and with which code. */
const REFUSED_WITH = /\/\/ refused TS(\d+)$/

/** TS2769, "No overload matches this call": how `$fetch` refuses a request. */
const NO_OVERLOAD_MATCHES = 2769

/** The Nuxt this suite is installed against. */
interface InstalledNuxt {
  readonly version: string
  /** Its `nuxt` CLI. */
  readonly cli: string
}

function installedNuxt(): InstalledNuxt {
  const path = createRequire(import.meta.url).resolve('nuxt/package.json')
  // SAFETY: every `nuxt` manifest this suite installs against (4.0.x and the
  // latest 4.x) carries its version and maps `bin.nuxt` to its CLI.
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    version: string
    bin: { nuxt: string }
  }

  return {
    version: manifest.version,
    cli: join(dirname(path), manifest.bin.nuxt),
  }
}

const NUXT = installedNuxt()

/** Whether this Nuxt ships the generated route engine: 4.6 and later. */
const HAS_GENERATED_ENGINE = ((): boolean => {
  const [major = 0, minor = 0] = NUXT.version.split('.').map(Number)

  return major > 4 || (major === 4 && minor >= 6)
})()

async function prepare(engine: 'internal-api' | 'generated'): Promise<void> {
  await run(process.execPath, [NUXT.cli, 'prepare', FIXTURE], {
    cwd: FIXTURE,
    env: { ...process.env, NATIVE_FIXTURE_ENGINE: engine },
  })
}

/** The 1-based lines of `file` that end in `marker`. */
function linesEndingIn(file: string, marker: string): number[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) =>
      line.trimEnd().endsWith(marker) ? [index + 1] : []
    )
}

/** Each line of `file` marked `// refused TS<code>`, as the diagnostic it promises. */
function markedRefusals(file: string) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) => {
      const code = REFUSED_WITH.exec(line.trimEnd())?.[1]

      return code === undefined
        ? []
        : [{ fileName: file, line: index + 1, code: Number(code) }]
    })
}

/** A diagnostic as these assertions compare it: where, and which. */
function located({ fileName, line, code }: Diagnostic) {
  return { fileName, line, code }
}

beforeAll(async () => {
  if (!existsSync(BUILT_SERVER_ENTRY)) {
    throw new Error(
      'No `dist` for the fixture to resolve. Run `pnpm run build` in this ' +
        'package, or run the suite through `turbo run test`, which builds it first.'
    )
  }

  await prepare('internal-api')
  if (HAS_GENERATED_ENGINE) await prepare('generated')
})

describe('vanilla $fetch and useFetch on Nitro’s route types, the flag off', () => {
  it('compile every call site as before, the ones the generated engine refuses included', () => {
    expect(compileInApp(INTERNAL_API, NATIVE_CHECK)).toEqual([])
  })
})

describe.skipIf(!HAS_GENERATED_ENGINE)(
  'vanilla $fetch and useFetch on the generated route engine, the flag on',
  () => {
    it('refuse exactly the calls marked as refused, and type every other', () => {
      const refused = linesEndingIn(NATIVE_CHECK, REFUSED)

      // Guards the comparison below against a file that lost its markers.
      expect(refused.length).toBeGreaterThanOrEqual(10)
      expect(compileInApp(GENERATED, NATIVE_CHECK).map(located)).toEqual(
        refused.map((line) => ({
          fileName: NATIVE_CHECK,
          line,
          code: NO_OVERLOAD_MATCHES,
        }))
      )
    })
  }
)

describe.skipIf(!HAS_GENERATED_ENGINE)(
  'the two-mechanism agreement: the slot through Nuxt’s extractor against the generated map',
  () => {
    it.each([
      ['Nitro’s route types', INTERNAL_API],
      ['the generated route engine', GENERATED],
    ])('holds in the app on %s', (_, buildDir) => {
      expect(compileInApp(buildDir, AGREEMENT_CHECK)).toEqual([])
    })
  }
)

describe('the fetch family, typed from the generated map whatever the route engine', () => {
  it('refuses exactly the marked calls on Nitro’s route types', () => {
    const refused = markedRefusals(BETTER_FETCH_CHECK)

    // Guards the comparison below against a file that lost its markers.
    expect(refused.length).toBeGreaterThanOrEqual(30)
    expect(compileInApp(INTERNAL_API, BETTER_FETCH_CHECK).map(located)).toEqual(
      refused
    )
  })

  it.skipIf(!HAS_GENERATED_ENGINE)(
    'refuses the same calls, and types every other the same, on the generated route engine',
    () => {
      expect(compileInApp(GENERATED, BETTER_FETCH_CHECK).map(located)).toEqual(
        markedRefusals(BETTER_FETCH_CHECK)
      )
    }
  )
})
