/**
 * Compile one fixture and read the diagnostics it produced.
 *
 * "This is a compile error" is a statement about a **diagnostic**, and the
 * `Expect<Equal<…>>` assertions in the suites next door cannot make it: they
 * prove a type resolved to a `CompositionError`, never that the author is shown
 * the sentence it carries. Only a compiler run answers that, so this reads one.
 *
 * The sibling's `test/types/compile-harness.ts` is the prior art; this is its
 * diagnostics half, without the hover renderer nothing here needs. It also owns
 * what every diagnostics suite would otherwise restate: where the fixtures and
 * their tsconfig live, the TypeScript codes those suites read, and the "which
 * diagnostics say this?" filter.
 *
 * Not a Vitest test file, so it is not matched by `vitest.config.ts`'s
 * `include`; knip reaches it through the suite importing it.
 */

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/** TS18003 - "No inputs were found in config file". */
const NO_INPUTS_FOUND = 18003

/** The TypeScript codes the suites here read, named once rather than per file. */
export const NO_OVERLOAD_MATCHES = 2769
export const NOT_ASSIGNABLE = 2322
export const PROPERTY_DOES_NOT_EXIST = 2339

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
 * Compile one fixture against a tsconfig's own options, and return only the
 * diagnostics that fixture itself produced - a stray error from a library on
 * the way in is not what any assertion here is about.
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

  // `readConfigFile` only surfaces read and JSON-syntax failures; a broken
  // `extends` or an invalid option lands here, and ignoring it would compile
  // the fixture against defaults instead of the intended config.
  //
  // TS18003 ("no inputs were found") is the exception: this harness supplies
  // the file list itself, so the config is never asked to match any.
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
