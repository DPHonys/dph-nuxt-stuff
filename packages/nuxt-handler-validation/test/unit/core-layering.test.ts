import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Nothing reachable from the `/server` entry may pull `@nuxt/kit`, a
// build-time package. Asserted on the source rather than on `dist`, so the
// failure lands on the import that broke it and needs no build to run.

const CORE_ENTRY = fileURLToPath(
  new URL('../../src/runtime/server/index.ts', import.meta.url)
)

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

describe('the /server core entry', () => {
  it('imports `@nuxt/kit` nowhere, as a value or as a type', () => {
    const kit = bareSpecifiersReachableFrom(CORE_ENTRY).filter((specifier) =>
      /^@nuxt\/kit(?:\/|$)/.test(specifier)
    )

    expect(kit).toEqual([])
  })
})
