import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The README quotes some code whole, each block marked with the file it was
// lifted from: a file `pnpm typecheck` compiles, so the quoted code compiles
// as long as the two agree. This suite holds their code line for line; only
// whole-line comments and blank lines may differ, so the README can leave out
// a lint directive or a note that only makes sense in the repository.

const PACKAGE_ROOT = new URL('../../', import.meta.url)

/** A package file's text, by its path from the package root, in `\n` lines. */
function read(path: string): string {
  return readFileSync(new URL(path, PACKAGE_ROOT), 'utf8').replaceAll(
    '\r\n',
    '\n'
  )
}

/**
 * One README marker, the file it names, and the code block right after it -
 * `undefined` when the marker is not followed by one, so a marker that drifts
 * from its block fails instead of dropping out of the comparison.
 */
interface LiftedBlock {
  readonly file: string
  readonly code: string | undefined
}

const MARKER = /<!-- lifted from (\S+) -->/g

/**
 * What must follow a marker: a `ts` block, after a blank line. The markdown
 * linter's own HTML directives may stand between them, where it reads them,
 * such as the `eslint-skip` that leaves the copy's linting to the file it was
 * lifted from; they render as nothing.
 */
const BLOCK = /^\n\n(?:<!-- eslint-[^\n]*-->\n\n)*```ts\n([\s\S]*?)```\n/

function liftedBlocks(readme: string): LiftedBlock[] {
  return [...readme.matchAll(MARKER)].map(
    ({ 0: marker, 1: file = '', index }) => ({
      file,
      code: BLOCK.exec(readme.slice(index + marker.length))?.[1],
    })
  )
}

/**
 * A file's code lines: every line but blank ones, `//` lines and the lines of
 * a block comment that stands on lines of its own. A line holding code beside
 * a comment is code, comment included.
 */
function codeLines(source: string): string[] {
  const kept: string[] = []
  let inBlockComment = false

  for (const line of source.split('\n')) {
    const text = line.trim()

    if (inBlockComment) {
      if (!text.includes('*/')) continue

      inBlockComment = false

      if (text.indexOf('*/') === text.length - 2) continue
    } else if (text === '' || text.startsWith('//')) {
      continue
    } else if (text.startsWith('/*')) {
      const close = text.indexOf('*/', 2)

      if (close === -1) {
        inBlockComment = true
        continue
      }

      if (close === text.length - 2) continue
    }

    kept.push(line)
  }

  return kept
}

describe('codeLines', () => {
  it('drops whole-line comments and blank lines', () => {
    expect(
      codeLines(
        [
          '/** One line. */',
          '/**',
          ' * Two lines.',
          ' */',
          '/* plain */',
          '// eslint-disable-next-line rule -- reason',
          '',
          '  // indented',
          'const a = 1',
        ].join('\n')
      )
    ).toEqual(['const a = 1'])
  })

  it('keeps every line that holds code', () => {
    const code = [
      'const product = 2',
      '  * 3',
      "const route = 'src/runtime/server'",
      'const b = 1 // trailing',
      '/* lead */ const c = 2',
      '/*',
      ' */ const d = 3',
    ]

    expect(codeLines(code.join('\n'))).toEqual(code.filter((_, i) => i !== 5))
  })
})

describe('the README', () => {
  const blocks = liftedBlocks(read('README.md'))

  it('follows every lifted-from marker with a ts block', () => {
    expect(blocks.map(({ file }) => file)).toContain(
      'playground/server/api/effect.get.ts'
    )
    expect(
      blocks.filter(({ code }) => code === undefined).map(({ file }) => file)
    ).toEqual([])
  })

  it('quotes the code of every lifted block as its file holds it', () => {
    for (const { file, code } of blocks) {
      expect(codeLines(code ?? ''), file).toEqual(codeLines(read(file)))
    }
  })

  it('quotes the Effect route the wire suite runs', () => {
    // The fixture imports the wrapper by path, where an app has it
    // auto-imported; apart from that line the code is the same.
    const IMPORT_BY_PATH =
      "import { defineBetterEventHandler } from '../../../../../src/runtime/server'"
    const fixture = codeLines(
      read('test/fixtures/errors/server/api/effect.get.ts')
    )

    expect(fixture).toContain(IMPORT_BY_PATH)
    expect(codeLines(read('playground/server/api/effect.get.ts'))).toEqual(
      fixture.filter((line) => line !== IMPORT_BY_PATH)
    )
  })
})
