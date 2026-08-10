/**
 * A minimal compile-and-render harness for the generated map, whose content is
 * a set of paths relative to where it is written — so it must be emitted into
 * a tree and compiled there. An unresolved `import("…")` in a `.d.ts` yields
 * no diagnostic under `skipLibCheck` and collapses to `any`, so `renderHover`
 * refuses to answer for a fixture that did not compile clean, and refuses to
 * answer `any`.
 */

import { dirname } from 'node:path'
import ts from 'typescript'

export interface Diagnostic {
  readonly code: number
  readonly message: string
  readonly fileName: string | undefined
}

export interface Compilation {
  /** The fixture file the program is rooted at. */
  readonly fixture: string
  readonly diagnostics: readonly Diagnostic[]
  /** A top-level `const` or `type` in the fixture, rendered as an editor would. */
  readonly renderHover: (name: string) => string
}

/**
 * Compile one fixture, alone, against a tsconfig's own file list.
 *
 * Alone so diagnostics cannot mask each other; *with* the config's files so a
 * lookup does not silently resolve to a residue of something missing.
 */
export function compileFixture(
  tsconfigPath: string,
  fixture: string
): Compilation {
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

  const program = ts.createProgram(
    [...new Set([fixture, ...parsed.fileNames])],
    {
      ...parsed.options,
      noEmit: true,
    }
  )

  const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    fileName: diagnostic.file?.fileName,
  }))

  return {
    fixture,
    diagnostics,
    renderHover: (name) => renderHover(program, fixture, diagnostics, name),
  }
}

export function assertNoDiagnostics(compilation: Compilation): void {
  if (compilation.diagnostics.length === 0) return

  throw new Error(
    [
      `${compilation.fixture} did not compile clean:`,
      ...compilation.diagnostics.map(
        (diagnostic) =>
          `  TS${diagnostic.code} at ${diagnostic.fileName ?? '<no file>'} — ${diagnostic.message}`
      ),
    ].join('\n')
  )
}

// `NoTruncation` so nothing is shortened, `InTypeAlias` so the type is
// expanded rather than echoed back as its own alias name — which would render
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
    (diagnostic) => diagnostic.fileName === fixture
  )
  if (own.length > 0) {
    throw new Error(
      [
        `Refusing to render \`${name}\`: ${fixture} did not compile clean.`,
        ...own.map(
          (diagnostic) => `  TS${diagnostic.code} — ${diagnostic.message}`
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
