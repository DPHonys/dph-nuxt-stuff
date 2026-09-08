import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PARENT_SPECIFIERS } from '../parent-specifiers'

// The parents' `/types` specifiers, resolved from an app that installed the
// umbrella alone. `typescript.hoist` resolves from the app's `modulesDir`
// and silently drops what it cannot find there, so the umbrella resolves
// each declaration from its own location and writes the `paths` entry
// itself - on every generated tsconfig, because every program has call
// sites: the errors map augments one specifier, the request-inputs map
// imports from the other.

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FIXTURE = join(PACKAGE_ROOT, 'test/fixtures/basic')
const BUILD_DIR = join(FIXTURE, '.nuxt')

/**
 * Every tsconfig Nuxt and Nitro generate: the four the spec names - the root
 * one, node, shared and Nitro's - and `tsconfig.app.json`, which is the app
 * program the root one references. A `paths` entry missing from any of them
 * is a program that cannot resolve the parents.
 */
const GENERATED_TSCONFIGS = [
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'tsconfig.shared.json',
  'tsconfig.server.json',
]

/** The slice of a generated tsconfig the entries are read off. */
const TsConfig = z.object({
  compilerOptions: z.object({
    paths: z.record(z.string(), z.array(z.string())),
  }),
})

function readTsConfig(name: string): z.infer<typeof TsConfig> {
  return TsConfig.parse(JSON.parse(readFileSync(join(BUILD_DIR, name), 'utf8')))
}

/**
 * Whether a `paths` target names a declaration file TypeScript will load:
 * the file itself, or - the extensionless form Nuxt writes - its `.d.ts`.
 */
function resolvesToDeclaration(target: string): boolean {
  const absolute = isAbsolute(target) ? target : resolve(BUILD_DIR, target)

  return (
    (absolute.endsWith('.d.ts') && existsSync(absolute)) ||
    existsSync(`${absolute}.d.ts`)
  )
}

beforeAll(() => {
  execFileSync(
    join(PACKAGE_ROOT, 'node_modules/.bin/nuxt'),
    ['prepare', FIXTURE],
    { cwd: PACKAGE_ROOT, stdio: 'pipe', timeout: 240_000 }
  )
}, 300_000)

describe('the parent /types specifiers, on the generated tsconfigs', () => {
  it.each(GENERATED_TSCONFIGS)(
    '%s maps both to a resolvable declaration file',
    (name) => {
      const { paths } = readTsConfig(name).compilerOptions

      for (const specifier of PARENT_SPECIFIERS) {
        const targets = paths[specifier]

        expect(targets, `${name} has no paths entry for ${specifier}`).toEqual([
          expect.any(String),
        ])
        expect(
          targets?.every(resolvesToDeclaration),
          `${name} maps ${specifier} to ${String(targets)}, which is not a declaration file`
        ).toBe(true)
      }
    }
  )

  it.each(GENERATED_TSCONFIGS)(
    '%s keeps every entry Nuxt and Nitro wrote beside them',
    (name) => {
      // The entry is added, never replacing the map: the aliases Nuxt writes
      // (`#imports`, `~`, …) and the umbrella's own hoist stay.
      const { paths } = readTsConfig(name).compilerOptions

      expect(paths).toHaveProperty(['@dphonys/nuxt-typed-handler/types'])
      expect(Object.keys(paths).length).toBeGreaterThan(
        PARENT_SPECIFIERS.length + 1
      )
    }
  )
})
