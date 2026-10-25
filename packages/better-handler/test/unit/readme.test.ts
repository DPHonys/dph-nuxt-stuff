import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The README quotes some code whole, each block marked with the file it was
// lifted from: a file `pnpm typecheck` compiles, so the quoted code compiles
// as long as the two agree, and this suite holds them byte for byte.

const PACKAGE_ROOT = new URL('../../', import.meta.url)

/** A package file's text, by its path from the package root. */
function read(path: string): string {
  return readFileSync(new URL(path, PACKAGE_ROOT), 'utf8')
}

/** One README code block and the file it says it was lifted from. */
interface LiftedBlock {
  readonly file: string
  readonly code: string
}

const LIFTED = /<!-- lifted from (\S+) -->\n\n```ts\n([\s\S]*?)```\n/g

function liftedBlocks(): LiftedBlock[] {
  return [...read('README.md').matchAll(LIFTED)].map(([, file = '', code]) => ({
    file,
    code: code ?? '',
  }))
}

/** A file's code without its comments and blank lines. */
function codeLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line) && line.trim() !== '')
}

describe('the README', () => {
  it('quotes every lifted block exactly as its file holds it', () => {
    const blocks = liftedBlocks()

    expect(blocks.map(({ file }) => file)).toContain(
      'playground/server/api/effect.get.ts'
    )

    for (const { file, code } of blocks) {
      expect(code, file).toBe(read(file))
    }
  })

  it('quotes the Effect route the wire suite runs', () => {
    // The fixture imports the wrapper by path, where an app has it
    // auto-imported; apart from that line the code is the same.
    const fixture = codeLines(
      read('test/fixtures/errors/server/api/effect.get.ts')
    ).filter((line) => !line.includes('src/runtime/server'))

    expect(codeLines(read('playground/server/api/effect.get.ts'))).toEqual(
      fixture
    )
  })
})
