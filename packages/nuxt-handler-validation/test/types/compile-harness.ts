/**
 * Compile one fixture and read the diagnostics it produced. The
 * `Assert<Equal<…>>` suites next door prove a type resolved, never that the
 * author is shown the sentence a guard carries; only a compiler run answers
 * that.
 *
 * Not a Vitest test file, so it is not matched by vitest's `include`; knip
 * reaches it through the suite importing it.
 */

import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/** TS18003 - "No inputs were found in config file". */
const NO_INPUTS_FOUND = 18003

/** The TypeScript codes the suites here read, named once rather than per file. */
export const NOT_ASSIGNABLE = 2322
export const PROPERTY_DOES_NOT_EXIST = 2339
/**
 * TS2375 - the `exactOptionalPropertyTypes` flavour of TS2322. Every key of
 * `ValidationSchemas` is optional, so a stray key lands here rather than on the
 * plain assignability code its composed siblings use.
 */
export const NOT_ASSIGNABLE_EXACT_OPTIONAL = 2375
export const WRONG_TYPE_ARGUMENT_COUNT = 2558

export interface Diagnostic {
  readonly code: number
  readonly message: string
  readonly line: number | undefined
}

/** The options every fixture compiles under - a consumer's own, extended. */
export const FIXTURE_TSCONFIG = fileURLToPath(
  new URL('./tsconfig.fixtures.json', import.meta.url)
)

/** One of the deliberately broken sources next door, by file name. */
export function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
}

/** The diagnostics carrying a sentence, in the order the compiler reported them. */
export function saying(
  diagnostics: readonly Diagnostic[],
  sentence: string
): readonly Diagnostic[] {
  return diagnostics.filter((diagnostic) =>
    diagnostic.message.includes(sentence)
  )
}

/**
 * The 1-based line a fixture's offending key sits on, found by its text - a
 * hard-coded line turns any edit above it into a false failure.
 */
export function lineContaining(fixture: string, needle: string): number {
  const lines = readFileSync(fixture, 'utf8').split('\n')
  const index = lines.findIndex((line) => line.includes(needle))

  if (index === -1) {
    throw new Error(`${fixture} has no line containing ${needle}`)
  }

  return index + 1
}

/**
 * Compile one fixture against a tsconfig's own options, returning only the
 * diagnostics that fixture itself produced.
 */
export function compileFixture(
  tsconfigPath: string,
  fixture: string
): readonly Diagnostic[] {
  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile)

  if (read.error !== undefined) {
    throw new Error(`Could not read ${tsconfigPath}`)
  }

  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(tsconfigPath),
    undefined,
    tsconfigPath
  )

  // A broken `extends` or an invalid option lands here rather than on
  // `readConfigFile`, and ignoring it would compile the fixture against
  // defaults. TS18003 is the exception: this harness supplies the file list.
  const fatal = parsed.errors.filter((error) => error.code !== NO_INPUTS_FOUND)

  if (fatal.length > 0) {
    throw new Error(
      [
        `${tsconfigPath} did not parse clean:`,
        ...fatal.map(
          (diagnostic) =>
            `  TS${diagnostic.code} - ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
        ),
      ].join('\n')
    )
  }

  const program = ts.createProgram([fixture], {
    ...parsed.options,
    noEmit: true,
  })

  return ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        normalize(diagnostic.file?.fileName) === normalize(fixture)
    )
    .map((diagnostic) => ({
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      line: lineOf(diagnostic),
    }))
}

// TypeScript reports file names with forward slashes; a path off `node:url` or
// `node:path` uses backslashes on Windows.
function normalize(path: string | undefined): string | undefined {
  return path?.replaceAll('\\', '/')
}

function lineOf(diagnostic: ts.Diagnostic): number | undefined {
  if (diagnostic.file === undefined || diagnostic.start === undefined) {
    return undefined
  }

  return (
    diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
  )
}
