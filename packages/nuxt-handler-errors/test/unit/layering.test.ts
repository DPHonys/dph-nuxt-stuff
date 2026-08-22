import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Each runtime entry may reach only its own layer: nothing under `/server`
// pulls `@nuxt/kit`, a build-time package, and the internals entries stay
// alias-free besides - every factory takes the channel token as a value, so
// a module layer composing them owns its own `#<name>/channel-token`
// binding. Asserted on the source rather than on `dist`, so the failure lands
// on the import that broke it and needs no build to run.

const CHANNEL_TOKEN_ALIAS = '#nuxt-handler-errors/channel-token'

interface Row {
  readonly entry: string
  readonly forbidden: readonly string[]
}

const ROWS: readonly Row[] = [
  { entry: 'src/runtime/server/index.ts', forbidden: ['@nuxt/kit'] },
  {
    entry: 'src/runtime/internals/server/index.ts',
    forbidden: ['@nuxt/kit', '#app', CHANNEL_TOKEN_ALIAS],
  },
  {
    entry: 'src/runtime/internals/shared/index.ts',
    forbidden: ['@nuxt/kit', 'nitropack/runtime', '#app', CHANNEL_TOKEN_ALIAS],
  },
  {
    entry: 'src/runtime/internals/app/index.ts',
    forbidden: ['@nuxt/kit', 'nitropack/runtime', CHANNEL_TOKEN_ALIAS],
  },
]

// Extensionless first, so a specifier that already carries `.ts` wins over a
// same-named directory.
const CANDIDATE_SUFFIXES = ['', '.ts', '/index.ts']

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

/** `@nuxt/kit` and `@nuxt/kit/…` alike; the alias is matched whole. */
function matches(specifier: string, forbidden: string): boolean {
  return specifier === forbidden || specifier.startsWith(`${forbidden}/`)
}

describe.each(ROWS)('the $entry entry', ({ entry, forbidden }) => {
  it(`reaches none of ${forbidden.join(', ')}, as a value or as a type`, () => {
    const reached = bareSpecifiersReachableFrom(
      fileURLToPath(new URL(`../../${entry}`, import.meta.url))
    ).filter((specifier) =>
      forbidden.some((banned) => matches(specifier, banned))
    )

    expect(reached).toEqual([])
  })
})
