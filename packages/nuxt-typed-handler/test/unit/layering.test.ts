import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Asserted on the source rather than on `dist`, so the failure lands on the
// import that broke it and needs no build to run.

const PACKAGE = fileURLToPath(new URL('../../', import.meta.url))

interface Row {
  /** A file, or a directory every `.ts` under which is walked. */
  readonly entry: string
  readonly forbidden: readonly string[]
}

// Unlike the parents, no row forbids `#nuxt-typed-handler/channel-token`: this
// package *is* the binding layer, so every runtime file that needs the token
// reads it from its own alias, and the parents' internals only ever receive it
// as a value.
const ROWS: readonly Row[] = [
  {
    entry: 'src/runtime/server/index.ts',
    forbidden: ['@nuxt/kit', '#app'],
  },
  {
    entry: 'src/runtime/shared/index.ts',
    forbidden: ['@nuxt/kit', 'nitropack/runtime', '#app'],
  },
  {
    entry: 'src/runtime/app',
    forbidden: ['@nuxt/kit', 'nitropack/runtime'],
  },
  // The build helpers are bundled by rollup from `src/module.ts` and reach
  // `@nuxt/kit` freely; no runtime file may pull that graph in behind them.
  {
    entry: 'src/runtime',
    forbidden: ['@dphonys/nuxt-handler-errors/internals/build'],
  },
]

// Extensionless first, so a specifier that already carries `.ts` wins over a
// same-named directory.
const CANDIDATE_SUFFIXES = ['', '.ts', '/index.ts']

/** The row's own files: one named entry, or every `.ts` under a directory. */
function filesOf(entry: string): string[] {
  const target = resolve(PACKAGE, entry)

  if (statSync(target).isFile()) return [target]

  return readdirSync(target, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.ts'))
    .map((item) => resolve(item.parentPath, item.name))
    .toSorted()
}

/** Every bare (non-relative) specifier the entry reaches, transitively. */
function bareSpecifiersReachableFrom(entry: string): string[] {
  const visited = new Set<string>()
  const bare = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)

    // `preProcessFile` reads the import graph without building a program, and
    // reports `import type` alongside value imports - a type import is one edit
    // away from a value import, so it counts here.
    const scanned = ts.preProcessFile(readFileSync(file, 'utf8'), true, true)

    for (const { fileName: specifier } of scanned.importedFiles) {
      if (!specifier.startsWith('.')) {
        bare.add(specifier)
        continue
      }

      const target = resolveRelative(dirname(file), specifier)
      if (target === undefined) {
        throw new Error(`Could not resolve "${specifier}" from ${file}.`)
      }

      queue.push(target)
    }
  }

  return [...bare].toSorted()
}

function resolveRelative(from: string, specifier: string): string | undefined {
  const base = resolve(from, specifier)
  return CANDIDATE_SUFFIXES.map((suffix) => `${base}${suffix}`).find(
    (candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile()
  )
}

/** `@nuxt/kit` and `@nuxt/kit/…` alike. */
function matches(specifier: string, forbidden: string): boolean {
  return specifier === forbidden || specifier.startsWith(`${forbidden}/`)
}

describe.each(ROWS)('the $entry layer', ({ entry, forbidden }) => {
  it(`reaches none of ${forbidden.join(', ')}, as a value or as a type`, () => {
    // Keyed by file, so a break names the file that pulled the graph in
    // rather than only the specifier it reached.
    const violations = filesOf(entry)
      .map(
        (file) =>
          [
            relative(PACKAGE, file),
            bareSpecifiersReachableFrom(file).filter((specifier) =>
              forbidden.some((banned) => matches(specifier, banned))
            ),
          ] as const
      )
      .filter(([, reached]) => reached.length > 0)

    expect(Object.fromEntries(violations)).toEqual({})
  })
})
