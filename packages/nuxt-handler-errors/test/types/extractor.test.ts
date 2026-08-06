import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import { assertNoDiagnostics, createTypeHarness } from './harness'
import type { TypeScriptModule } from './harness'

/**
 * Layer 1 for the extractor (SPEC.md §9.1): the lock the whole design rests on,
 * proved with no Nuxt, no emitter and no running server in the path.
 *
 * Two things are asserted here that the fixture itself cannot claim. The
 * `Flatten` mandate is a **rendering** property — both spellings are
 * structurally identical, so only a length budget sees it break (SPEC.md §9.3).
 * And the brand's survival through **declaration emit** is a property of the
 * emitted `.d.ts`, which only exists once a compiler has been asked to produce
 * one.
 */

const TYPE_SUITE = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_ROOT = resolve(TYPE_SUITE, '../..')
const ROUTE_FIXTURE = join(TYPE_SUITE, 'pos/branded-route.ts')
const FIXTURE_CONFIG = join(TYPE_SUITE, 'tsconfig.fixtures.json')

/**
 * The options declaration emit runs under: the fixture config's own, plus the
 * two flags that turn emit on.
 *
 * Read out of `tsconfig.fixtures.json` rather than restated, because the point
 * of the round trip is that the declaration is emitted under the same program
 * settings the consumer is then compiled under. A hand-written copy would drift
 * — `verbatimModuleSyntax`, `isolatedModules` and `noUncheckedIndexedAccess`
 * all change what a fixture proves — and the drift would be invisible.
 */
function emitOptions(
  compiler: TypeScriptModule
): import('typescript').CompilerOptions {
  const read = compiler.readConfigFile(FIXTURE_CONFIG, compiler.sys.readFile)
  const parsed = compiler.parseJsonConfigFileContent(
    read.config,
    compiler.sys,
    dirname(FIXTURE_CONFIG),
    undefined,
    FIXTURE_CONFIG
  )

  // `configFilePath` is dropped deliberately. The tsgo bridge this repo once
  // checked with re-read the config from it and put the config's own
  // `noEmit: true` back, silently skipping emit (measured then: with the
  // field left in, this emitted nothing at all once another program had been
  // built in the same process). Stock does no such re-read, so the drop is
  // now pure hygiene — the field is metadata, not an option.
  const { configFilePath: _configFilePath, ...options } = parsed.options

  return {
    ...options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
  }
}

/**
 * Run declaration emit over one route file and hand back the emitted text.
 *
 * The emitted declaration is what a handler from a Nuxt layer or a published
 * package actually arrives as, so this is the only form in which the "the brand
 * survives declaration emit" claim can be made at all.
 */
function emitDeclaration(compiler: TypeScriptModule, route: string): string {
  const program = compiler.createProgram([route], emitOptions(compiler))

  const before = compiler
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      compiler.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    )
  expect(before, 'the route must type-check before it is emitted').toEqual([])

  let emitted: string | undefined
  const result = program.emit(
    program.getSourceFile(route),
    (fileName, text) => {
      if (fileName.endsWith('.d.ts')) emitted = text
    }
  )

  expect(
    result.diagnostics.map((diagnostic) =>
      compiler.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    ),
    'declaration emit must not report anything'
  ).toEqual([])
  if (emitted === undefined) {
    throw new Error(`Declaration emit produced no .d.ts for ${route}.`)
  }

  return emitted
}

/**
 * Re-anchor the emitted declaration's **relative** module specifiers.
 *
 * The declaration is compiled verbatim; only the specifiers move, because the
 * file is being read from a directory other than the one it was emitted for.
 * That is the same arithmetic a real publish does — and it is the specifiers,
 * not the types, that this ticket makes no claim about.
 *
 * **Both forms have to be rewritten**, and missing the second one is silent:
 * declaration emit writes its type references as `import("…")` type nodes
 * rather than as import statements, and an `import("…")` that does not resolve
 * inside a `.d.ts` is swallowed whole by `skipLibCheck` — leaving the handler
 * `any`, the round trip vacuous, and every assertion in it green. Measured
 * here. One pattern covers both, keeping the opening delimiter and rewriting
 * only what follows it.
 */
function reanchor(declaration: string, emittedFor: string): string {
  const from = dirname(emittedFor)

  return declaration.replace(
    /(from '|import\(")(\.[^'"]*)/g,
    (_match, opening: string, specifier: string) =>
      `${opening}${resolve(from, specifier)}`
  )
}

describe('the extractor', () => {
  const harness = createTypeHarness({ ts })

  describe('reading a route’s declared union back off its type', () => {
    it('holds every positive claim, with zero diagnostics', () => {
      assertNoDiagnostics(harness.compileAlone('pos/extractor.ts'))
    })

    it('leaves the route fixture itself an ordinary, clean route', () => {
      // It is the declaration-emit source as well as the extractor's subject,
      // so a diagnostic in it would make both assertions vacuous.
      assertNoDiagnostics(harness.compileAlone('pos/branded-route.ts'))
    })
  })

  describe('the Flatten mandate (SPEC.md §8.3(a))', () => {
    it('collapses a variant’s intersection into one rendered object', () => {
      // A matched pair, so the assertion proves it can fail as well as pass:
      // the two declarations are the same variant, and the only difference is
      // the mandate. `} & {` is the whole tell — an intersection rendered as
      // an intersection is what puts a variant's payload behind a second brace
      // pair in every hover and every diagnostic that shows it.
      const compilation = harness.compileAlone('pos/extractor.ts')

      expect(compilation.renderHover('_hoverRawVariant')).toContain('} & {')
      expect(compilation.renderHover('_hoverFlatVariant')).not.toContain(
        '} & {'
      )
    })

    it('renders the envelope as the flat variants, not a Serialize residue', () => {
      // SPEC.md §8.3(a)'s own subject, measured rather than assumed: a union
      // forwarded on as a type argument to `DeclaredErrorBody`.
      //
      // MEASURED, and it does not match what §8.3(a) records — see the
      // implementation effort's SPEC-AMENDMENTS entry. As compiled here,
      // `Simplify<Serialize<…>>` is already evaluated and a nested type
      // argument renders as its alias chain, so no `Serialize` residue is
      // reachable here in either spelling and `Flatten` makes the render one
      // name longer rather than shorter. What is asserted is therefore the
      // property that actually holds and that would be a real regression if it
      // stopped: no residue reaches the envelope's rendering.
      //
      // No length budget: the two spellings measure 289 and 304 characters, a
      // 5% spread, and SPEC.md §9.3's budgets are calibrated for the 2–20×
      // regressions they were decided on. Ticket 10 owns the `H_error` budget
      // and must re-take this measurement against the real playground under
      // `vue-tsc`, where the union arrives through an instantiated generic
      // rather than a hand-written annotation.
      const compilation = harness.compileAlone('pos/extractor.ts')
      const rendered = compilation.renderHover('_hoverEnvelope')

      expect(rendered).not.toContain('SerializeObject')
      expect(rendered).toContain('DeclaredErrorBody<')
    })
  })

  describe('the brand surviving declaration emit', () => {
    const emitted = mkdtempSync(join(tmpdir(), 'nuxt-handler-errors-emit-'))

    afterAll(() => {
      rmSync(emitted, { recursive: true, force: true })
    })

    it('keeps the union readable out of the emitted .d.ts', () => {
      const declaration = emitDeclaration(ts, ROUTE_FIXTURE)

      // The brand rides a named interface, so the emitted declaration has to
      // still name it — erasure to a bare `EventHandler` would unbrand every
      // handler a consumer imports from a layer or a package.
      expect(declaration).toContain('TypedEventHandler<')

      writeFileSync(
        join(emitted, 'route.d.ts'),
        reanchor(declaration, ROUTE_FIXTURE)
      )

      // The consumer is generated rather than committed because the only
      // module specifier that can reach the emitted file is one computed after
      // the temporary directory exists.
      const consumer = join(emitted, 'consumer.ts')
      writeFileSync(
        consumer,
        [
          `import type { ExtractErrorsSafe } from '${join(PACKAGE_ROOT, 'src/runtime/types')}'`,
          `import type { Equal, Expect, IsAny, IsNever } from '${join(TYPE_SUITE, 'vocabulary')}'`,
          `import type handler from './route.js'`,
          ``,
          `export type Declared = ExtractErrorsSafe<typeof handler>`,
          ``,
          `type _tags = Expect<Equal<Declared['tag'],`,
          `  'user-not-found' | 'user-suspended' | 'quota-exceeded'>>`,
          `type _payload = Expect<`,
          `  Equal<Extract<Declared, { tag: 'user-not-found' }>['userId'], string>>`,
          `type _notCollapsed = Expect<Equal<IsAny<Declared>, false>>`,
          `type _notEmpty = Expect<Equal<IsNever<Declared>, false>>`,
          ``,
        ].join('\n')
      )

      const compilation = harness.compileAlone(consumer)
      assertNoDiagnostics(compilation)

      // Direct evidence, alongside the `Expect<Equal<…>>` claims above: the
      // union really is *in* the emitted declaration, tags and payload fields
      // and all. It is what would have caught the `import("…")` trap in
      // `reanchor` had it been written first.
      const rendered = compilation.renderHover('Declared')

      expect(rendered).toContain('"user-not-found"')
      expect(rendered).toContain('"user-suspended"')
      expect(rendered).toContain('"quota-exceeded"')
      expect(rendered).toContain('userId: string')
      // Two whole TypeScript programs — a declaration emit and a compile of the
      // generated consumer — so Vitest's 5 s default is a measure of how busy
      // the box is rather than of anything this test claims. Alone it runs in
      // ~3 s; with the file suite saturating eight workers it reached ~7 s once
      // SPEC.md §3.3's types joined the graph the emit walks. Explicit, in the
      // style `test/generated-map.test.ts` already uses for its `nuxt prepare`
      // builds.
    }, 60_000)
  })
})
