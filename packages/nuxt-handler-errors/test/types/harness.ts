/**
 * The compile-time assertion harness (SPEC.md §9.0, §9.5, §9.9).
 *
 * This module's whole value proposition is compile-time, so ordinary runtime
 * assertions prove almost nothing. Everything the suite claims about types is
 * claimed through here: a fixture is compiled **alone**, its real diagnostics
 * are matched on **code plus a message substring**, and a type is **rendered**
 * the way an editor would render it so its length can be budgeted.
 *
 * ## Why a compiler-API harness is not stock `tsc` in disguise
 *
 * `createProgram` + `getPreEmitDiagnostics` are taken from this repo's pinned
 * `typescript-native-bridge`, a drop-in `typescript` whose checker runs
 * in-process on tsgo. That is the canonical gate's own checker, reached
 * programmatically (SPEC.md §9.0).
 *
 * ## The compiler is a parameter
 *
 * Nothing here imports `typescript` at the top level; `createTypeHarness` takes
 * the module. The suite runs under the pinned bridge only and the consumer gap
 * that leaves is accepted (SPEC.md §9.8) — but a future stock-TypeScript run is
 * then a `describe.each([bridge, stock])` plus one aliased dev dependency
 * rather than a harness rewrite. The second compiler is deliberately not wired
 * up.
 *
 * ## Four traps this file exists to keep closed
 *
 * - **One program per fixture** (SPEC.md §9.2). Compiling the `neg/` fixtures
 *   together lets one file's diagnostics mask another's, which is what would
 *   make the later tickets' fixtures meaningless.
 * - **The renderer is handed the whole program**, never the file under
 *   inspection alone (SPEC.md §9.9 trap 4). The first attempt at this passed
 *   only the target file and every lookup silently came back `unknown`/`any` —
 *   a harness that passes everything. `compileAlone` therefore always seeds the
 *   program with the fixture *plus* the fixture config's own file list, and
 *   `renderHover` refuses to render out of a fixture that did not compile
 *   clean. Measured here: a starved program does not reliably yield `any`, it
 *   yields a *residue* of the unresolved reference — plausible-looking, budget-
 *   sized, and silent. The diagnostic is the reliable signal; the `any` check
 *   is the secondary one.
 * - **Positive fixtures assert zero diagnostics** (SPEC.md §9.5 rule 3), which
 *   is why `assertNoDiagnostics` takes no filter.
 * - **`neg/` fixtures are excluded from the package `tsconfig` and from lint**
 *   (SPEC.md §9.9 trap 1). They are deliberately non-compiling. This harness
 *   passes explicit `compilerOptions` per file regardless, so the exclusion
 *   costs the fixtures nothing.
 *
 * ## Three bridge behaviours later tickets will trip over
 *
 * All three were measured here, and each is handled inside this file — they are
 * recorded because they shape what an assertion may say.
 *
 * 1. **A new program invalidates every older one.** `getSourceFile` on the
 *    older program starts answering `undefined`. `renderHover` rebuilds when it
 *    notices, so a `Compilation` stays usable, but nothing outside this file
 *    should hold a raw `Program`.
 * 2. **A diagnostic's own `file` has an empty `text`**, so positions have to be
 *    taken from the program's copy of that file.
 * 3. **Rendered types quote string literals with single quotes**
 *    (`{ tag: 'forbidden' }`), while *diagnostic messages* quote them with
 *    double quotes (`type '"forbidden"'`). Expected strings must match the
 *    surface they come from.
 */

import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** The compiler module, taken as a parameter rather than imported. */
export type TypeScriptModule = typeof import('typescript')

/** One pre-emit diagnostic, flattened to the parts assertions may match on. */
export interface HarnessDiagnostic {
  /** The `TSxxxx` number, without the prefix. */
  readonly code: number
  /** `flattenDiagnosticMessageText` of the whole chain. */
  readonly message: string
  readonly fileName: string | undefined
  /** 1-based, as an editor reports it. */
  readonly line: number | undefined
}

/**
 * What a negative fixture claims: a code **and** a message substring.
 *
 * The substring half is not decoration. §3.2's guard-first mandate is tested
 * only by asserting that the colliding tag is still visible in the rendered
 * message, and that couples the suite to TypeScript's truncation length on
 * purpose — a compiler bump that truncates the tag away has genuinely broken
 * the mandate (SPEC.md §9.2).
 */
export interface DiagnosticExpectation {
  readonly code: number
  readonly message: string
}

/**
 * A rendered-length budget for one hover target (SPEC.md §9.3).
 *
 * Budgets sit around 1.5× the measured good value, with the measured good/bad
 * pair recorded in a comment beside each, so a failure reads as *"the mandate
 * broke"* rather than *"a number moved"*.
 */
export interface HoverBudget {
  /** Name of a top-level `const` or `type` declaration in the fixture. */
  readonly name: string
  /** Maximum rendered characters, inclusive. */
  readonly max: number
}

export interface TypeHarnessOptions {
  /** The compiler module. See "The compiler is a parameter" above. */
  readonly ts: TypeScriptModule
  /** Fixture paths resolve against this. Defaults to this file's directory. */
  readonly rootDir?: string
  /**
   * Defaults to `<rootDir>/tsconfig.fixtures.json`.
   *
   * A fixture that needs extra declarations in its program — the generated
   * `.nuxt/types/*.d.ts` augmentations, say, which nothing imports — gets them
   * by naming them in a config's `include`, which `compileAlone` turns into
   * root files (SPEC.md §9.9 trap 4). That is the only hook, on purpose: a
   * second per-call one would be a second way to say the same thing.
   */
  readonly tsconfigPath?: string
}

/** One fixture, compiled alone. */
export interface Compilation {
  /** Absolute path of the fixture, for failure messages. */
  readonly fixture: string
  /** Every root file the program was seeded with, fixture first. */
  readonly rootNames: readonly string[]
  /** Every pre-emit diagnostic in the whole program, unfiltered. */
  readonly diagnostics: readonly HarnessDiagnostic[]
  /**
   * The string an editor would show for `name`, with truncation disabled.
   *
   * Throws when the declaration is missing, when the fixture itself did not
   * compile clean, and when the type renders as `any` or `unknown`. The last
   * two are refusals rather than errors: a type read out of a broken program,
   * or a type that renders in three characters, measures nothing.
   */
  readonly renderHover: (name: string) => string
}

export interface TypeHarness {
  /** Compile one fixture in its own program (SPEC.md §9.2). */
  readonly compileAlone: (fixture: string) => Compilation
}

/**
 * Matches a never-check written without the tuple wrap.
 *
 * Assembled from two fragments so that this file does not trip the scan it
 * implements — the source text never contains the pattern it looks for. That is
 * the same discipline SPEC.md §9.9 trap 3 imposes on prose about an
 * expect-error directive, and it means the scan can safely be pointed at every
 * file in the suite, including this one.
 *
 * Three details carry weight. `\s+` spans newlines, so a check broken across
 * two lines is still seen. The trailing `(?![\w$])` stops `extends nevermore`
 * from being a finding. And `(?!\s*\[)` lets `X extends never[]` through —
 * that is an array type, not a never-check.
 */
const BARE_NEVER_CHECK = new RegExp(
  `extends\\s+${'never'}(?![\\w$])(?!\\s*\\[)`,
  'g'
)

/**
 * Line numbers (1-based) carrying a never-check that was not tuple-wrapped.
 *
 * `[X] extends [never]` is invisible to this: the wrapped form puts `never`
 * inside brackets.
 */
export function findBareNeverChecks(source: string): readonly number[] {
  return [...source.matchAll(BARE_NEVER_CHECK)].map(
    (match) => source.slice(0, match.index).split('\n').length
  )
}

/**
 * Fail if any of `files` writes a never-check without the tuple wrap
 * (SPEC.md §9.5 rule 2).
 *
 * Of the three rules, this is the one the suite cannot keep on discipline
 * alone: the unwrapped form is shorter, reads correctly, and *passes*. Rule 3
 * is enforced by `assertNoDiagnostics` and rule 1 by `IsAny` being the only
 * helper that can make its claim, so neither needs a scan.
 *
 * It lives here rather than beside `IsNever` because `./vocabulary` has to stay
 * type-only: the fixtures import it, and they compile under a config with
 * `types: []` where `node:fs` does not resolve.
 */
export function assertNoBareNeverChecks(files: readonly string[]): void {
  const findings = files.flatMap((file) =>
    findBareNeverChecks(readFileSync(file, 'utf8')).map(
      (line) => `${file}:${line}`
    )
  )

  if (findings.length > 0) {
    fail([
      'Never-checks must be tuple-wrapped — use `IsNever<X>` from',
      './vocabulary, or write the bracketed form by hand. Without the wrap the',
      'conditional distributes over the empty union and is vacuously true.',
      ...findings.map((finding) => `  ${finding}`),
    ])
  }
}

/**
 * Assert that the fixture produced a diagnostic with this code **and** a
 * message containing this substring.
 *
 * "Some error happened here" is not an assertion: a fixture that fails for an
 * unrelated reason would satisfy it. Returns the matched diagnostic so a caller
 * can make a further claim about it.
 */
export function assertDiagnostic(
  compilation: Compilation,
  expected: DiagnosticExpectation
): HarnessDiagnostic {
  const match = compilation.diagnostics.find(
    (diagnostic) =>
      diagnostic.code === expected.code &&
      diagnostic.message.includes(expected.message)
  )

  if (match === undefined) {
    fail([
      `Expected TS${expected.code} whose message contains`,
      `${JSON.stringify(expected.message)} in ${compilation.fixture}.`,
      ...describeDiagnostics(compilation),
    ])
  }

  return match
}

/**
 * Assert that the fixture compiled completely clean (SPEC.md §9.5 rule 3).
 *
 * Nothing here filters by file: a positive fixture whose *dependency* stopped
 * compiling is not a passing fixture.
 */
export function assertNoDiagnostics(compilation: Compilation): void {
  if (compilation.diagnostics.length > 0) {
    fail([
      `Expected ${compilation.fixture} to compile clean.`,
      ...describeDiagnostics(compilation),
    ])
  }
}

/**
 * Render `budget.name` and assert it fits (SPEC.md §9.3).
 *
 * Character count is the metric all three §8.3 legibility mandates were
 * actually decided on, and it is far more stable than the exact string:
 * cosmetic churn moves it a few percent, a real regression moves it 2–20×.
 * Returns the rendered string.
 */
export function assertHoverBudget(
  compilation: Compilation,
  budget: HoverBudget
): string {
  const rendered = compilation.renderHover(budget.name)

  if (rendered.length > budget.max) {
    fail([
      `Hover budget blown for \`${budget.name}\` in ${compilation.fixture}:`,
      `${rendered.length} characters against a budget of ${budget.max}.`,
      rendered,
    ])
  }

  return rendered
}

interface Built {
  readonly program: import('typescript').Program
  readonly generation: number
}

/**
 * Measured on the pinned bridge: creating a program **invalidates every program
 * created before it** — the older one keeps its root file names but
 * `getSourceFile` starts answering `undefined` for all of them. Diagnostics are
 * therefore read eagerly, and a hover rebuilds its program whenever anything
 * else has compiled since (~13ms). Without this, a fixture compiled in a
 * `describe` body silently loses its program the moment a neighbouring test
 * compiles anything.
 *
 * The counter is process-wide rather than per-harness because the invalidation
 * belongs to the compiler, not to the harness that called it.
 */
let programGeneration = 0

export function createTypeHarness(options: TypeHarnessOptions): TypeHarness {
  const { ts } = options
  const rootDir = options.rootDir ?? dirname(fileURLToPath(import.meta.url))
  const tsconfigPath = resolveFrom(
    rootDir,
    options.tsconfigPath ?? 'tsconfig.fixtures.json'
  )

  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (read.error !== undefined) {
    fail([
      `Could not read ${tsconfigPath}:`,
      ts.flattenDiagnosticMessageText(read.error.messageText, '\n'),
    ])
  }

  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(tsconfigPath),
    undefined,
    tsconfigPath
  )
  if (parsed.errors.length > 0) {
    fail([
      `Could not parse ${tsconfigPath}:`,
      ...parsed.errors.map((error) =>
        ts.flattenDiagnosticMessageText(error.messageText, '\n')
      ),
    ])
  }

  // SPEC.md §9.3 mandates NoTruncation, and it is the whole point of a length
  // budget that the renderer never shortens what it measures. Measured here:
  // the verbose self-test hover renders 320 characters with the flag and is cut
  // to `boolean; }...` without it.
  //
  // The other two are inherited from the probe that produced §9.3's recorded
  // good/bad pairs, which rendered with
  // `NoTruncation | InTypeAlias | UseFullyQualifiedType`. InTypeAlias is kept:
  // it expands the type rather than echoing an alias name back, which is what
  // makes a residue visible at all — a flattening regression that renames
  // nothing would otherwise render identically. UseFullyQualifiedType is
  // dropped: it was measured against every declaration in this suite and
  // produced byte-identical output, so it can only ever add `import("…")`
  // prefixes that no editor displays and that would inflate a budget with
  // machine-specific path noise.
  const hoverFlags =
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias

  function build(rootNames: readonly string[]): Built {
    const program = ts.createProgram([...rootNames], {
      ...parsed.options,
      noEmit: true,
    })
    programGeneration += 1
    return { program, generation: programGeneration }
  }

  function compileAlone(fixture: string): Compilation {
    const fixturePath = resolveFrom(rootDir, fixture)

    // The fixture comes first and the config's own file list follows. Both
    // halves matter: alone, so diagnostics cannot mask each other; with the
    // rest of the program, so lookups do not silently resolve to a residue of
    // whatever was missing.
    //
    // The bridge happens to re-expand the config's `include` from
    // `configFilePath` on its own, so naming the files here is currently
    // belt-and-braces. Keep it: it is what stock TypeScript needs, and §9.8's
    // future second compiler is supposed to be a parameter change.
    const rootNames = [...new Set([fixturePath, ...parsed.fileNames])]

    let built = build(rootNames)

    const diagnostics = ts
      .getPreEmitDiagnostics(built.program)
      .map((diagnostic) => toHarnessDiagnostic(ts, built.program, diagnostic))

    return {
      fixture: fixturePath,
      rootNames,
      diagnostics,
      renderHover: (name) => {
        if (built.generation !== programGeneration) built = build(rootNames)

        return renderHoverFrom(
          {
            ts,
            program: built.program,
            fixture: fixturePath,
            diagnostics,
            flags: hoverFlags,
          },
          name
        )
      },
    }
  }

  return { compileAlone }
}

function resolveFrom(rootDir: string, path: string): string {
  return isAbsolute(path) ? path : resolve(rootDir, path)
}

function toHarnessDiagnostic(
  ts: TypeScriptModule,
  program: import('typescript').Program,
  diagnostic: import('typescript').Diagnostic
): HarnessDiagnostic {
  const fileName = diagnostic.file?.fileName

  // The bridge hands back a diagnostic whose `file` carries the name but an
  // empty `text`, so asking *it* for a position answers line 0 every time. The
  // program's copy of the same file has the text.
  const sourceFile =
    fileName === undefined ? undefined : program.getSourceFile(fileName)
  const position =
    sourceFile !== undefined && diagnostic.start !== undefined
      ? ts.getLineAndCharacterOfPosition(sourceFile, diagnostic.start)
      : undefined

  return {
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    fileName,
    line: position === undefined ? undefined : position.line + 1,
  }
}

/**
 * Everything one compiled fixture needs to answer a hover. The five travel
 * together everywhere, so they are one thing rather than five arguments.
 */
interface FixtureProgram {
  readonly ts: TypeScriptModule
  readonly program: import('typescript').Program
  readonly fixture: string
  readonly diagnostics: readonly HarnessDiagnostic[]
  readonly flags: import('typescript').TypeFormatFlags
}

function renderHoverFrom(
  { ts, program, fixture, diagnostics, flags }: FixtureProgram,
  name: string
): string {
  // The primary guard for SPEC.md §9.9 trap 4, and it is deliberately not the
  // `any` check further down. Measured: a fixture rendered from a program that
  // was starved of the declarations it needed does **not** come back `any` — it
  // comes back as a residue of the unresolved reference, which is a plausible
  // string of a plausible length that quietly satisfies a budget. What the
  // starved program does reliably produce is a diagnostic in the fixture
  // itself, so that is what is checked.
  //
  // Consequence, on purpose: hovers are a positive-fixture surface. A `neg/`
  // fixture cannot be rendered.
  const own = diagnostics.filter(
    (diagnostic) => diagnostic.fileName === fixture
  )
  if (own.length > 0) {
    fail([
      `Refusing to render \`${name}\`: ${fixture} did not compile clean,`,
      'so any type read out of it is a guess. Usually this means the program',
      'was assembled without files the fixture needed — check the fixture',
      "config's `include` still names the declarations it needs.",
      ...own.map(
        (diagnostic) =>
          `  TS${diagnostic.code} at :${diagnostic.line ?? '?'} — ${diagnostic.message}`
      ),
    ])
  }

  const sourceFile = program.getSourceFile(fixture)
  if (sourceFile === undefined) {
    fail([`${fixture} is not in the program.`, ...describeRootFiles(program)])
  }

  const checker = program.getTypeChecker()
  const declaration = findHoverTarget(ts, sourceFile, name)
  if (declaration === undefined) {
    throw new Error(
      `No top-level \`const\` or \`type\` named \`${name}\` in ${fixture}.`
    )
  }

  const symbol = checker.getSymbolAtLocation(declaration.name)
  if (symbol === undefined) {
    throw new Error(`\`${name}\` in ${fixture} has no symbol.`)
  }

  const type = ts.isTypeAliasDeclaration(declaration)
    ? checker.getDeclaredTypeOfSymbol(symbol)
    : checker.getTypeOfSymbolAtLocation(symbol, declaration)

  const rendered = checker.typeToString(type, declaration, flags)

  // The second guard, for the collapse that arrives *without* a diagnostic:
  // an untyped declaration renders as two or three characters and fits every
  // budget ever written, so it can never be reported as a measurement.
  if (rendered === 'any' || rendered === 'unknown') {
    fail([
      `\`${name}\` in ${fixture} rendered as \`${rendered}\`, which fits any`,
      'budget and proves nothing. The declaration is untyped.',
      ...describeRootFiles(program),
    ])
  }

  return rendered
}

function findHoverTarget(
  ts: TypeScriptModule,
  sourceFile: import('typescript').SourceFile,
  name: string
):
  | import('typescript').VariableDeclaration
  | import('typescript').TypeAliasDeclaration
  | undefined {
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

/**
 * Every failure message here is built as lines and joined once, rather than
 * concatenated — a harness whose failures are unreadable gets its assertions
 * loosened until they stop failing.
 */
function fail(lines: readonly string[]): never {
  throw new Error(lines.join('\n'))
}

function describeDiagnostics(compilation: Compilation): readonly string[] {
  if (compilation.diagnostics.length === 0) {
    return ['The program reported no diagnostics at all.']
  }

  return [
    `The program reported ${compilation.diagnostics.length}:`,
    ...compilation.diagnostics.map(
      (diagnostic) =>
        `  TS${diagnostic.code} at ${diagnostic.fileName ?? '<no file>'}:${diagnostic.line ?? '?'} — ${diagnostic.message}`
    ),
  ]
}

function describeRootFiles(
  program: import('typescript').Program
): readonly string[] {
  return [
    'Root files were:',
    ...program
      .getRootFileNames()
      .map((file) => `  ${relative(process.cwd(), file)}`),
  ]
}
