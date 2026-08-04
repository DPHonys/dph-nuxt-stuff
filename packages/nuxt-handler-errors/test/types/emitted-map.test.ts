import type { NitroEventHandler } from 'nitropack/types'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import { emitMap } from '../../src/emit-map'
import type { EmitMapOptions } from '../../src/emit-map'
import {
  assertDiagnostic,
  assertNoDiagnostics,
  createTypeHarness,
} from './harness'
import type { Compilation } from './harness'

/**
 * Layer 2 (SPEC.md §9.4): the emitted map, compiled.
 *
 * `test/emit-map.test.ts` asserts what the emitter *writes*. Nothing there can
 * see whether the text it wrote **means** anything, and the gap is not
 * theoretical — it is the implementation effort's SPEC-AMENDMENTS item 8,
 * handed forward to this ticket by name. Declaration emit writes its type
 * references as `import("…")` type nodes; an `import("…")` that does not
 * resolve inside a `.d.ts` produces **no diagnostic** under `skipLibCheck`,
 * which `tsconfig.fixtures.json` sets. The declaration collapses silently, and
 * an `Expect<Equal<…>>` suite over it goes green having proved nothing at all.
 *
 * So the claim made here is a **rendering** one: the union is read back out of
 * the map and its tags and payload fields are asserted present. The
 * `when it resolves to nothing` block below emits the same map against a
 * deliberately wrong output directory and shows both halves of the trap — the
 * structural assertions still pass, and only the render catches it.
 *
 * Everything is built in a temporary tree rather than committed, because the
 * emitted map's whole content is a set of paths relative to where it is written
 * — a committed fixture would have to hard-code an answer instead of computing
 * one.
 */

const TYPE_SUITE = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_ROOT = resolve(TYPE_SUITE, '../..')

/** The temp tree's build directory, named as Nuxt names the one it hands Nitro. */
const BUILD_DIR = '.nuxt'

/** Where the map lands, relative to an app root. Nitro's `typesDir`. */
const MAP_PATH = `${BUILD_DIR}/types/nuxt-handler-errors.d.ts`

const ROOT = mkdtempSync(join(tmpdir(), 'nuxt-handler-errors-map-'))

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

/** Two catalogues for the same path, declaring genuinely different failures. */
const CATALOGUE_A = [
  `import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/shared'`,
  ``,
  `export const userErrors = defineErrors({`,
  `  'user-not-found': { status: 404, payload: payload<{ userId: string, until: Date }>() },`,
  `  'user-suspended': { status: 403 },`,
  `})`,
  ``,
  `export const firstTag = 'user-not-found'`,
  ``,
].join('\n')

const CATALOGUE_B = [
  `import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/shared'`,
  ``,
  `export const userErrors = defineErrors({`,
  `  'account-locked': { status: 423, payload: payload<{ userId: string, until: Date }>() },`,
  `  'rate-limited': { status: 429 },`,
  `  'quota-exceeded': { status: 402 },`,
  `})`,
  ``,
  `export const firstTag = 'account-locked'`,
  ``,
].join('\n')

/**
 * The route files of one app, keyed by path relative to its root.
 *
 * Every app below shares this layout and differs only in the catalogue, which
 * is what makes the path-referentiality assertion a byte comparison. The
 * handler raises whichever tag its catalogue declares first, so the same route
 * file compiles against both.
 */
function appFiles(catalogue: string): Record<string, string> {
  return {
    'shared/errors/user.ts': catalogue,

    'server/api/users/[id].get.ts': [
      `import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/shared'`,
      `import { firstTag, userErrors } from '../../../shared/errors/user'`,
      ``,
      `export default defineTypedEventHandler(`,
      `  { errors: [userErrors] },`,
      `  async (event, { fail }) => {`,
      `    const id = event.path.slice(1)`,
      `    if (id === '') return fail(firstTag, { userId: id, until: new Date() })`,
      `    return { id }`,
      `  },`,
      `)`,
      ``,
    ].join('\n'),

    // A `default`-keyed route: no method in the file name, so SPEC.md §4.3's
    // presence-based fallback is what a `GET` caller resolves through — and
    // SPEC.md §10.3's `expanded` mode is what rewrites it into nine keys.
    'server/api/y.ts': [
      `import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/shared'`,
      `import { userErrors } from '../../shared/errors/user'`,
      ``,
      `export default defineTypedEventHandler(`,
      `  { errors: [userErrors] },`,
      `  async () => ({ ok: true }),`,
      `)`,
      ``,
    ].join('\n'),

    // Unbranded, and keyed anyway (SPEC.md §4.2). This is the arm that makes
    // ticket 08's lookup total without a "we chose not to key this" branch.
    'server/api/legacy.get.ts': [
      `import { defineEventHandler } from 'h3'`,
      ``,
      `export default defineEventHandler(() => ({ legacy: true }))`,
      ``,
    ].join('\n'),

    // The deferred-hardening case ticket 05 left unguarded and asked ticket 06
    // to look for a route to: a default export carrying an index signature
    // satisfies `{ __declaredErrors__?: infer E }` with `E = unknown`, and
    // `ExtractErrorsSafe` hands that straight back — the poison SPEC.md §4.3
    // mandate 1 exists to stop, through a door the `IsAny` arm does not cover.
    // Keyed here so the map answers the question with a measurement.
    'server/api/indexed.get.ts': [
      `const handler: { [key: string]: unknown } = {}`,
      ``,
      `export default handler`,
      ``,
    ].join('\n'),
  }
}

/**
 * The handler records Nitro would have scanned for `appFiles`.
 *
 * Written by hand rather than by running Nitro, which is the whole point of
 * SPEC.md §4.6: these are the records ticket 07 will hand over, and the emitter
 * never sees anything else.
 */
function appHandlers(root: string): NitroEventHandler[] {
  return [
    {
      route: '/api/users/:id',
      method: 'get',
      handler: join(root, 'server/api/users/[id].get.ts'),
    },
    { route: '/api/y', handler: join(root, 'server/api/y.ts') },
    {
      route: '/api/legacy',
      method: 'get',
      handler: join(root, 'server/api/legacy.get.ts'),
    },
    {
      route: '/api/indexed',
      method: 'get',
      handler: join(root, 'server/api/indexed.get.ts'),
    },
  ]
}

interface AppSpec {
  /** Directory under the suite's temp root. */
  readonly name: string
  readonly catalogue: string
  readonly methodKeys?: EmitMapOptions['methodKeys']
  /**
   * A `buildDir` to hand the emitter *instead of* this app's real one, while
   * the map is still written to `MAP_PATH`. The one knob that breaks every
   * specifier in the emitted file.
   */
  readonly pretendBuildDir?: string
}

interface App {
  readonly root: string
  /** The emitted text, so path-referentiality can be a byte comparison. */
  readonly emitted: string
  /** Compile one consumer fixture inside this app, alone, with the map in scope. */
  readonly compile: (name: string, source: string) => Compilation
}

/**
 * Materialise one app: route files, the emitted map, and a tsconfig.
 *
 * Three resolution decisions, and none of them rewrites a byte of the emitted
 * text — the map is compiled exactly as the emitter produced it:
 *
 * - **`node_modules` is symlinked to the package's own.** The map imports
 *   `nitropack/types` by bare specifier, and a temp directory resolves nothing.
 *   In a real build the file sits in `.nuxt/types` inside the consumer's own
 *   tree, where that specifier resolves for exactly this reason.
 * - **This package's two published specifiers are mapped to `src/`.** A
 *   consumer resolves them through its own `node_modules` to `dist/`; pointing
 *   them at source keeps this a unit-level check rather than one gated on a
 *   build, and it is the same substitution `./extractor.test.ts` makes.
 * - **`include` names the emitted declaration explicitly.** TypeScript's
 *   wildcard expansion skips dot-directories and `.nuxt` is one. Nothing
 *   imports the map — an augmentation reaches a program by membership alone —
 *   so if it were not named here it would simply be absent, and every assertion
 *   below would go green against an interface that stayed empty.
 */
function buildApp(spec: AppSpec): App {
  const root = join(ROOT, spec.name)
  mkdirSync(root, { recursive: true })
  symlinkSync(
    join(PACKAGE_ROOT, 'node_modules'),
    join(root, 'node_modules'),
    'junction'
  )

  for (const [path, contents] of Object.entries(appFiles(spec.catalogue))) {
    write(root, path, contents)
  }

  const emitted = emitMap(appHandlers(root), {
    nitroOptions: {
      buildDir: spec.pretendBuildDir ?? join(root, BUILD_DIR),
      srcDir: join(root, 'server'),
      alias: {},
    },
    ...(spec.methodKeys === undefined ? {} : { methodKeys: spec.methodKeys }),
  })

  write(root, MAP_PATH, emitted)
  write(
    root,
    'tsconfig.json',
    `${JSON.stringify(
      {
        extends: join(TYPE_SUITE, 'tsconfig.fixtures.json'),
        compilerOptions: {
          paths: {
            '@dphonys/nuxt-handler-errors/types': [
              join(PACKAGE_ROOT, 'src/runtime/types.ts'),
            ],
            '@dphonys/nuxt-handler-errors/shared': [
              join(PACKAGE_ROOT, 'src/runtime/shared.ts'),
            ],
          },
        },
        include: [MAP_PATH],
      },
      undefined,
      2
    )}\n`
  )

  const harness = createTypeHarness({
    ts,
    rootDir: root,
    tsconfigPath: join(root, 'tsconfig.json'),
  })

  return {
    root,
    emitted,
    compile: (name, source) => harness.compileAlone(write(root, name, source)),
  }
}

function write(root: string, relativePath: string, contents: string): string {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)

  return path
}

/** The two imports every consumer fixture below opens with. */
const CONSUMER_PRELUDE = [
  `import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'`,
  `import type { Equal, Expect, IsAny, IsNever } from '${join(TYPE_SUITE, 'vocabulary')}'`,
  ``,
]

const APP_A = buildApp({ name: 'app-a', catalogue: CATALOGUE_A })
const APP_B = buildApp({ name: 'app-b', catalogue: CATALOGUE_B })

describe('the emitted map, compiled', () => {
  const compilation = APP_A.compile(
    'consumer.ts',
    [
      ...CONSUMER_PRELUDE,
      `export type Declared = TypedApiErrors['/api/users/:id']['get']`,
      `export type Defaulted = TypedApiErrors['/api/y']['default']`,
      `export type Unbranded = TypedApiErrors['/api/legacy']['get']`,
      `export type Indexed = TypedApiErrors['/api/indexed']['get']`,
      ``,
      `type _tags = Expect<Equal<Declared['tag'], 'user-not-found' | 'user-suspended'>>`,
      `type _payload = Expect<`,
      `  Equal<Extract<Declared, { tag: 'user-not-found' }>['userId'], string>>`,
      `type _notCollapsed = Expect<Equal<IsAny<Declared>, false>>`,
      `type _notEmpty = Expect<Equal<IsNever<Declared>, false>>`,
      `type _default = Expect<Equal<Defaulted['tag'], Declared['tag']>>`,
      `type _unbranded = Expect<IsNever<Unbranded>>`,
      `type _indexed = Expect<IsNever<Indexed>>`,
      ``,
    ].join('\n')
  )

  it('compiles clean, with the map in the program', () => {
    assertNoDiagnostics(compilation)
  })

  it('carries the route’s real tags and payload fields', () => {
    // The check SPEC-AMENDMENTS item 8 says is the one that catches a map that
    // resolved to nothing. Tags render **double**-quoted: they are synthesised
    // by the checker out of an object literal's inferred type rather than
    // written in an annotation (item 7).
    const rendered = compilation.renderHover('Declared')

    expect(rendered).toContain('"user-not-found"')
    expect(rendered).toContain('"user-suspended"')
    expect(rendered).toContain('userId: string')
  })

  it('applies Serialize around the extractor, so a Date arrives as a string', () => {
    // Direct evidence that the `Simplify<Serialize<…>>` the emitter writes
    // around `ExtractErrorsSafe` is doing work: the catalogue declares
    // `until: Date`, and the map is the wire's view of it.
    expect(compilation.renderHover('Declared')).toContain('until: string')
  })

  it('neutralises the index-signature leak at this position', () => {
    // Ticket 05's deferred hardening, answered rather than inherited.
    // `ExtractErrorsSafe` really does hand back `unknown` here — but the map
    // never emits the extractor bare. `Serialize<unknown>` is `never`
    // (`nitropack/dist/types/index.d.ts:184-186`: `unknown` matches no arm and
    // falls off the end), so the wrapper SPEC.md §4.2 mandates for wire-honesty
    // closes this door as a side effect. **No extra arm is needed in the
    // extractor for anything reachable through the map**; a consumer calling
    // `ExtractErrorsSafe` directly is still exposed, which is ticket 15's note
    // to write rather than this one's code to change.
    expect(compilation.renderHover('Indexed')).toBe('never')
  })

  it('extracts nothing from an unbranded route, without special-casing it', () => {
    // Keying every route costs nothing precisely because of this (SPEC.md
    // §4.2). `renderHover` will not answer `any` or `unknown`, so this is the
    // third possibility stated outright.
    expect(compilation.renderHover('Unbranded')).toBe('never')
  })
})

describe('the emitted map, when it resolves to nothing', () => {
  /**
   * The same emitter, the same app, one thing changed: the map is written into
   * `.nuxt/types` but emitted as though it were going somewhere else, so every
   * `import("…")` in it points at a file that is not there.
   *
   * **Nothing complains, and the damage is worse than SPEC-AMENDMENTS item 8
   * predicts.** Item 8 expected the entry to become `any` and
   * `ExtractErrorsSafe`'s `IsAny` guard to turn that into `never`. Measured
   * here: it does not. An unresolved `import("…")` yields TypeScript's *error
   * type*, which renders as `any` but is not `any` — it propagates through
   * every conditional it is fed to and satisfies whatever constraint it lands
   * against. The fixture below pins that down the only way it can be pinned
   * down: it asserts `IsAny<Declared>` is `false` **and** that it is `true`, in
   * the same program, and the program compiles clean. No inhabited type
   * satisfies both. SPEC.md §4.3 mandate 1's guard therefore never fires, and
   * the entry stays `any` all the way to the call site.
   */
  const broken = buildApp({
    name: 'app-broken',
    catalogue: CATALOGUE_A,
    pretendBuildDir: join(ROOT, 'app-broken/elsewhere/deeper'),
  })

  const compilation = broken.compile(
    'consumer.ts',
    [
      ...CONSUMER_PRELUDE,
      `export type Declared = TypedApiErrors['/api/users/:id']['get']`,
      ``,
      `type _tags = Expect<Equal<Declared['tag'], 'user-not-found' | 'user-suspended'>>`,
      `type _notCollapsed = Expect<Equal<IsAny<Declared>, false>>`,
      `type _isAnyToo = Expect<Equal<IsAny<Declared>, true>>`,
      `type _notEmpty = Expect<Equal<IsNever<Declared>, false>>`,
      ``,
    ].join('\n')
  )

  it('is swallowed whole: the structural assertions are green and vacuous', () => {
    // Every one of the four assertions above is false of this map, and not one
    // of them fails. Two of them contradict each other outright — `IsAny` is
    // asserted `false` and `true` in the same program — which is what makes
    // this a measurement of the error type rather than a guess about it. This
    // is what a suite looks like the day the emitter starts writing paths that
    // resolve to nothing.
    assertNoDiagnostics(compilation)
  })

  it('is caught by the rendering assertion, which is why one is used', () => {
    expect(() => compilation.renderHover('Declared')).toThrow(
      /rendered as `any`/
    )
  })

  it('and the contradiction is a real diagnostic when the map resolves', () => {
    // The control for the experiment above. Without it, "both halves of a
    // contradiction compiled" could just mean `Expect` never checks anything.
    // Against APP_A's working map the same pair is `TS2344`, so the silence
    // over the broken map is a property of the broken map.
    assertDiagnostic(
      APP_A.compile(
        'control.ts',
        [
          ...CONSUMER_PRELUDE,
          `type Declared = TypedApiErrors['/api/users/:id']['get']`,
          ``,
          `type _notAny = Expect<Equal<IsAny<Declared>, false>>`,
          `type _isAny = Expect<Equal<IsAny<Declared>, true>>`,
          ``,
        ].join('\n')
      ),
      { code: 2344, message: 'true' }
    )
  })
})

describe('path-referentiality, against two apps that really do differ', () => {
  const compilation = APP_B.compile(
    'consumer.ts',
    [
      ...CONSUMER_PRELUDE,
      `export type Declared = TypedApiErrors['/api/users/:id']['get']`,
      ``,
      `type _tags = Expect<Equal<Declared['tag'], 'account-locked' | 'rate-limited' | 'quota-exceeded'>>`,
      ``,
    ].join('\n')
  )

  it('emits byte-identical text for two different catalogues', () => {
    // SPEC.md §4.4 and §4.6's mandate, end to end. Two apps, the same routes at
    // the same relative paths, catalogues that share not one tag — and the
    // emitted map is the same string. This is the property that lets Nitro
    // never regenerate route types on a content change, and it is why no
    // runtime value map may ever be emitted: a value map resolves its tags at
    // build time and would go stale with no watcher that would ever fix it.
    expect(APP_A.emitted).toBe(APP_B.emitted)
  })

  it('compiles clean against the other catalogue', () => {
    // SPEC.md §9.5 rule 3, and not a formality here: `renderHover` refuses only
    // on diagnostics in the *fixture*, while this fixture's whole subject is a
    // declaration that reaches it from two files away.
    assertNoDiagnostics(compilation)
  })

  it('and the compiler still tells the two apart', () => {
    // The other half, and the half a string comparison cannot make: byte
    // identity would be worthless if the type were stale too. It is not,
    // because the emitted text is an import expression the compiler re-resolves
    // against whatever is on disk now.
    const rendered = compilation.renderHover('Declared')

    expect(rendered).toContain('"account-locked"')
    expect(rendered).toContain('"rate-limited"')
    expect(rendered).not.toContain('"user-not-found"')
  })
})

describe('the `expanded` method-key mode, still compiling (SPEC.md §10.3)', () => {
  // The test that stops the documented fallback rotting into one that no longer
  // compiles the day it is needed. `expanded` moves SPEC.md §4.3's `default`
  // fallback out of the type level and into the emitter, so a `default`-keyed
  // route answers on all nine method keys through a bare index with zero
  // conditionals.
  const expanded = buildApp({
    name: 'app-expanded',
    catalogue: CATALOGUE_A,
    methodKeys: 'expanded',
  })

  const compilation = expanded.compile(
    'consumer.ts',
    [
      ...CONSUMER_PRELUDE,
      `export type Patch = TypedApiErrors['/api/y']['patch']`,
      `export type Get = TypedApiErrors['/api/y']['get']`,
      ``,
      `type _same = Expect<Equal<Patch, Get>>`,
      `type _notCollapsed = Expect<Equal<IsAny<Patch>, false>>`,
      `type _notEmpty = Expect<Equal<IsNever<Patch>, false>>`,
      ``,
    ].join('\n')
  )

  it('compiles clean, with nine method keys and no default', () => {
    assertNoDiagnostics(compilation)
    expect(expanded.emitted).not.toContain(`'default'`)
  })

  it('answers with the route’s real union on every expanded key', () => {
    expect(compilation.renderHover('Patch')).toContain('"user-not-found"')
  })
})
