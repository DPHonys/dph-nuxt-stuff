/**
 * Compile one fixture and read the diagnostics it produced. A type resolving
 * proves nothing about what the author is shown - the sentence a guard
 * carries is only a compiler run's to answer.
 *
 * Copied from the umbrella package's harness, both flavours. Every program
 * checks its fixture first, before the declarations the fixture imports: the
 * order an editor meets a call site in, and the one in which source-form
 * declarations report a stack-depth error that dependency order hides.
 *
 * Not a Vitest test file, so it is not matched by vitest's `include`; knip
 * reaches it through the suites importing it.
 */

import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { isString } from '../../src/runtime/shared/guards'

/** TS18003 - "No inputs were found in config file". */
const NO_INPUTS_FOUND = 18003

/** TS2321 and TS2589: the stack-depth errors, wherever they are reported. */
const STACK_DEPTH = new Set([2321, 2589])

export interface Diagnostic {
  readonly code: number
  readonly message: string
  readonly line: number | undefined
  /** Which file reported it, for a program that reports on several. */
  readonly fileName: string | undefined
}

/** A fixture compiled with everything it imports, ready to be read from. */
export interface Compilation {
  /** The fixture file the program is rooted at. */
  readonly fixture: string
  /** Every diagnostic of the whole program, not the fixture's alone. */
  readonly diagnostics: readonly Diagnostic[]
  /** A top-level `const` or `type` in the fixture, rendered as an editor would. */
  readonly renderHover: (name: string) => string
}

/** The options every fixture compiles under - a consumer's own, extended. */
export const FIXTURE_TSCONFIG = fileURLToPath(
  new URL('./tsconfig.fixtures.json', import.meta.url)
)

/** The package's own tsconfig, which extends the one Nuxt generates. */
const PACKAGE_TSCONFIG = fileURLToPath(
  new URL('../../tsconfig.json', import.meta.url)
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
 * A tsconfig's own options, parsed. A broken `extends` or an invalid option
 * lands on `parseJsonConfigFileContent` rather than on `readConfigFile`, and
 * ignoring it would compile a fixture against defaults. TS18003 is the
 * exception: the caller supplies the root file itself.
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
 * Where `nitropack/*` resolves, as Nuxt maps it in every app's generated
 * tsconfig: the package reads Nitro's types through the app's own Nitro and
 * depends on none of its own, so a fixture compiled outside a Nuxt app needs
 * the same mapping. Read once from the package's generated tsconfig, the
 * paths made absolute.
 */
function nitroTypePaths(): Record<string, string[]> {
  const { paths = {}, pathsBasePath } = parseTsConfig(PACKAGE_TSCONFIG).options
  const base = isString(pathsBasePath) ? pathsBasePath : ''

  return Object.fromEntries(
    Object.entries(paths)
      .filter(([specifier]) => specifier.startsWith('nitropack'))
      .map(([specifier, targets]) => [
        specifier,
        targets.map((target) =>
          isAbsolute(target) ? target : resolve(base, target)
        ),
      ])
  )
}

const NITRO_TYPE_PATHS = nitroTypePaths()

/**
 * The program for one fixture, its fixture already checked: first, so the
 * declarations it imports are checked in the adverse order. With the
 * config's own files too when asked, so a declaration the fixture reaches by
 * membership alone - an augmentation - is in the program; or with only the
 * roots named, for a config whose own files are more than the fixture may
 * see.
 */
function checkedProgram(
  tsconfigPath: string,
  fixture: string,
  withConfigFiles: boolean | readonly string[] = false
): ts.Program {
  const parsed = parseTsConfig(tsconfigPath)
  const roots =
    withConfigFiles === true
      ? [fixture, ...parsed.fileNames]
      : withConfigFiles === false
        ? [fixture]
        : [fixture, ...withConfigFiles]

  const program = ts.createProgram([...new Set(roots)], {
    ...parsed.options,
    paths: { ...NITRO_TYPE_PATHS, ...parsed.options.paths },
    noEmit: true,
  })

  const sourceFile = program.getSourceFile(fixture)

  if (sourceFile === undefined) {
    throw new Error(`${fixture} is not in its own program.`)
  }

  program.getSemanticDiagnostics(sourceFile)

  return program
}

/**
 * Compile one fixture against a tsconfig's own options, returning only the
 * diagnostics that fixture itself produced. A stack-depth error anywhere in
 * the program fails the compile instead: it would otherwise hide on a
 * declaration the fixture only imports.
 */
export function compileFixture(
  tsconfigPath: string,
  fixture: string
): readonly Diagnostic[] {
  const diagnostics = ts
    .getPreEmitDiagnostics(checkedProgram(tsconfigPath, fixture))
    .map(toDiagnostic)

  refuseStackDepth(fixture, diagnostics)

  return diagnostics.filter(
    (diagnostic) => normalize(diagnostic.fileName) === normalize(fixture)
  )
}

/**
 * Compile one fixture inside an app `nuxt prepare` generated: under the
 * app's own `tsconfig.app.json`, rooted at the fixture and the app's
 * `nuxt.d.ts`, which brings in Nuxt's globals and every generated type, and
 * at nothing else of the app's. Returns every diagnostic of the program, not
 * only the fixture's - an app's route a fixture reaches is compiled here and
 * nowhere else - and refuses a stack-depth error anywhere in it.
 */
export function compileInApp(
  buildDir: string,
  fixture: string
): readonly Diagnostic[] {
  const diagnostics = ts
    .getPreEmitDiagnostics(
      checkedProgram(resolve(buildDir, 'tsconfig.app.json'), fixture, [
        resolve(buildDir, 'nuxt.d.ts'),
      ])
    )
    .map(toDiagnostic)

  refuseStackDepth(fixture, diagnostics)

  return diagnostics
}

/**
 * Compile one fixture, with its config's own files, for reading its types
 * back. `renderHover` refuses to
 * answer for a program that did not compile clean, and refuses to answer
 * `any` or `unknown`: a lookup that resolved to nothing compiles clean and
 * renders as one of those.
 */
export function compileForHover(
  tsconfigPath: string,
  fixture: string
): Compilation {
  const program = checkedProgram(tsconfigPath, fixture, true)
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
          `  TS${diagnostic.code} at ${diagnostic.fileName ?? '<no file>'}:${diagnostic.line ?? '?'} - ${diagnostic.message}`
      ),
    ].join('\n')
  )
}

function refuseStackDepth(
  fixture: string,
  diagnostics: readonly Diagnostic[]
): void {
  const deep = diagnostics.filter(({ code }) => STACK_DEPTH.has(code))

  if (deep.length === 0) return

  throw new Error(
    [
      `${fixture} reported a stack-depth error:`,
      ...deep.map(
        (diagnostic) =>
          `  TS${diagnostic.code} at ${diagnostic.fileName ?? '<no file>'}:${diagnostic.line ?? '?'} - ${diagnostic.message}`
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
  // The primary guard: a type read out of a program that did not compile is
  // a guess, not a measurement.
  if (diagnostics.length > 0) {
    throw new Error(
      [
        `Refusing to render \`${name}\`: the program did not compile clean.`,
        ...diagnostics.map(
          (diagnostic) =>
            `  TS${diagnostic.code} at ${diagnostic.fileName ?? '<no file>'} - ${diagnostic.message}`
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

  // The second guard, for the collapse that arrives without a diagnostic.
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
