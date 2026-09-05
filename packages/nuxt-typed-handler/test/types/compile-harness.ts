/**
 * Compile one fixture and read the diagnostics it produced. A type resolving
 * proves nothing about what the author is shown - the sentence a guard
 * carries is only a compiler run's to answer.
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

/**
 * TS2375 - the `exactOptionalPropertyTypes` flavour of TS2322. Every key of
 * `ValidationSchemas` is optional, so a stray key lands here rather than on the
 * plain assignability code.
 */
export const NOT_ASSIGNABLE_EXACT_OPTIONAL = 2375

export interface Diagnostic {
  readonly code: number
  readonly message: string
  readonly line: number | undefined
  /** Which file reported it - `compileForHover` sees the whole program. */
  readonly fileName: string | undefined
}

/** A fixture compiled with its config's own files, ready to be read from. */
export interface Compilation {
  /** The fixture file the program is rooted at. */
  readonly fixture: string
  readonly diagnostics: readonly Diagnostic[]
  /** A top-level `const` or `type` in the fixture, rendered as an editor would. */
  readonly renderHover: (name: string) => string
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
 * A tsconfig's own options and file list, parsed. A broken `extends` or an
 * invalid option lands on `parseJsonConfigFileContent` rather than on
 * `readConfigFile`, and ignoring it would compile a fixture against defaults.
 * TS18003 is the exception: a caller here supplies the root file itself.
 */
function parseTsConfig(tsconfigPath: string): ts.ParsedCommandLine {
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

  return parsed
}

/**
 * Compile one fixture against a tsconfig's own options, returning only the
 * diagnostics that fixture itself produced.
 */
export function compileFixture(
  tsconfigPath: string,
  fixture: string
): readonly Diagnostic[] {
  const program = ts.createProgram([fixture], {
    ...parseTsConfig(tsconfigPath).options,
    noEmit: true,
  })

  return ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        normalize(diagnostic.file?.fileName) === normalize(fixture)
    )
    .map(toDiagnostic)
}

/**
 * Compile one fixture *with* its config's own files, and read types back out
 * of the program - the flavour the generated map needs, whose content is a
 * set of paths relative to where it is written. An unresolved `import("…")`
 * in a `.d.ts` yields no diagnostic under `skipLibCheck` and collapses to
 * `any`, so `renderHover` refuses to answer for a fixture that did not
 * compile clean, and refuses to answer `any`.
 *
 * With the config's files, rather than the fixture alone, so a lookup does
 * not silently resolve to a residue of something missing.
 */
export function compileForHover(
  tsconfigPath: string,
  fixture: string
): Compilation {
  const parsed = parseTsConfig(tsconfigPath)
  const program = ts.createProgram(
    [...new Set([fixture, ...parsed.fileNames])],
    {
      ...parsed.options,
      noEmit: true,
    }
  )

  const diagnostics = ts.getPreEmitDiagnostics(program).map(toDiagnostic)

  return {
    fixture,
    diagnostics,
    renderHover: (name) => renderHover(program, fixture, diagnostics, name),
  }
}

/** Throws unless the compilation produced no diagnostic at all. */
export function assertNoDiagnostics(compilation: Compilation): void {
  if (compilation.diagnostics.length === 0) return

  throw new Error(
    [
      `${compilation.fixture} did not compile clean:`,
      ...compilation.diagnostics.map(
        (diagnostic) =>
          `  TS${diagnostic.code} at ${diagnostic.fileName ?? '<no file>'} - ${diagnostic.message}`
      ),
    ].join('\n')
  )
}

// `NoTruncation` so nothing is shortened, `InTypeAlias` so the type is
// expanded rather than echoed back as its own alias name - which would render
// identically whatever it resolved to.
const HOVER_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias

function renderHover(
  program: ts.Program,
  fixture: string,
  diagnostics: readonly Diagnostic[],
  name: string
): string {
  // The primary guard: a type read out of a fixture that did not compile is a
  // guess, not a measurement.
  const own = diagnostics.filter(
    (diagnostic) => normalize(diagnostic.fileName) === normalize(fixture)
  )

  if (own.length > 0) {
    throw new Error(
      [
        `Refusing to render \`${name}\`: ${fixture} did not compile clean.`,
        ...own.map(
          (diagnostic) => `  TS${diagnostic.code} - ${diagnostic.message}`
        ),
      ].join('\n')
    )
  }

  const sourceFile = program.getSourceFile(fixture)

  if (sourceFile === undefined) {
    throw new Error(`${fixture} is not in the program.`)
  }

  const declaration = findTarget(sourceFile, name)

  if (declaration === undefined) {
    throw new Error(`No top-level \`const\` or \`type\` named \`${name}\`.`)
  }

  const checker = program.getTypeChecker()
  const symbol = checker.getSymbolAtLocation(declaration.name)

  if (symbol === undefined) {
    throw new Error(`\`${name}\` has no symbol.`)
  }

  const type = ts.isTypeAliasDeclaration(declaration)
    ? checker.getDeclaredTypeOfSymbol(symbol)
    : checker.getTypeOfSymbolAtLocation(symbol, declaration)

  const rendered = checker.typeToString(type, declaration, HOVER_FLAGS)

  // The second guard, for the collapse that arrives *without* a diagnostic.
  if (rendered === 'any' || rendered === 'unknown') {
    throw new Error(
      `\`${name}\` rendered as \`${rendered}\`, which proves nothing.`
    )
  }

  return rendered
}

function findTarget(
  sourceFile: ts.SourceFile,
  name: string
): ts.VariableDeclaration | ts.TypeAliasDeclaration | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) {
      return statement
    }

    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return declaration
      }
    }
  }

  return undefined
}

function toDiagnostic(diagnostic: ts.Diagnostic): Diagnostic {
  return {
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    line: lineOf(diagnostic),
    fileName: diagnostic.file?.fileName,
  }
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
