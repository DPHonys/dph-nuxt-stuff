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
import { afterAll, describe, expect, it } from 'vitest'
import { emitMap } from '../../src/emit-map'
import { assertNoDiagnostics, compileFixture } from './compile-harness'
import type { Compilation } from './compile-harness'

/**
 * The emitted map, compiled.
 *
 * `test/unit/emit-map.test.ts` asserts what the emitter *writes*. Nothing
 * there can see whether the text it wrote **means** anything, and the gap is
 * not theoretical: an `import("…")` that does not resolve inside a `.d.ts`
 * produces no diagnostic under `skipLibCheck`, the declaration collapses
 * silently, and an `Expect<Equal<…>>` suite over it goes green having proved
 * nothing. So the claim made here is a **rendering** one — the union is read
 * back out of the map and its tags and payload fields are asserted present.
 * The `when it resolves to nothing` block emits the same map against a
 * deliberately wrong output directory and shows both halves of the trap.
 *
 * Everything is built in a temporary tree rather than committed, because the
 * emitted map's whole content is a set of paths relative to where it is
 * written — a committed fixture would have to hard-code an answer instead of
 * computing one.
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

/** Two definition modules for the same path, declaring genuinely different failures. */
const DEFINITIONS_A = [
  `import { defineError, payload } from '@dphonys/nuxt-handler-errors/server'`,
  ``,
  `export const userErrors = defineError({`,
  `  'user-not-found': { status: 404, payload: payload<{ userId: string, until: Date }>() },`,
  `  'user-suspended': { status: 403 },`,
  `})`,
  ``,
  `export const firstTag = 'user-not-found'`,
  ``,
].join('\n')

const DEFINITIONS_B = [
  `import { defineError, payload } from '@dphonys/nuxt-handler-errors/server'`,
  ``,
  `export const userErrors = defineError({`,
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
 * Every app below shares this layout and differs only in the definitions,
 * which is what makes the path-referentiality assertion a byte comparison. The
 * handler fails with whichever tag its module declares first, so the same
 * route file compiles against both.
 */
function appFiles(definitions: string): Record<string, string> {
  return {
    'server/errors/user.ts': definitions,

    'server/api/users/[id].get.ts': [
      `import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'`,
      `import { firstTag, userErrors } from '../../errors/user'`,
      ``,
      `export default defineCheckedEventHandler(`,
      `  { errors: [...userErrors] },`,
      `  (event, { fail }) => {`,
      `    const id = event.path.slice(1)`,
      `    if (id === '') return fail(firstTag, { userId: id, until: new Date() })`,
      `    return { id }`,
      `  },`,
      `)`,
      ``,
    ].join('\n'),

    // A `default`-keyed route: no method in the file name, so the
    // presence-based fallback is what a `GET` caller resolves through.
    'server/api/y.ts': [
      `import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'`,
      `import { userErrors } from '../errors/user'`,
      ``,
      `export default defineCheckedEventHandler(`,
      `  { errors: [...userErrors] },`,
      `  () => ({ ok: true }),`,
      `)`,
      ``,
    ].join('\n'),

    // Unbranded, and keyed anyway. This is the arm that makes the lookup total
    // without a "we chose not to key this" branch.
    'server/api/legacy.get.ts': [
      `import { defineEventHandler } from 'h3'`,
      ``,
      `export default defineEventHandler(() => ({ legacy: true }))`,
      ``,
    ].join('\n'),

    // A default export carrying an index signature satisfies
    // `{ __knownErrors__?: infer E }` with `E = unknown`, which
    // `KnownErrorsOfHandler` hands straight back — the one door its guards do
    // not close. Keyed here so the map answers it with a measurement.
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
 * Written by hand rather than by running Nitro, which is the point: these are
 * the records the module hands over, and the emitter never sees anything else.
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
  readonly definitions: string
  /**
   * A `buildDir` to hand the emitter *instead of* this app's real one, while
   * the map is still written to `MAP_PATH`. The one knob that breaks every
   * specifier in the emitted file.
   */
  readonly pretendBuildDir?: string
}

interface AppTree {
  readonly root: string
  /** The emitted text, so path-referentiality can be a byte comparison. */
  readonly emitted: string
}

interface App extends AppTree {
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
 * - **This package's published specifiers are mapped to `src/`.** A consumer
 *   resolves them through its own `node_modules` to `dist/`; pointing them at
 *   source keeps this a unit-level check rather than one gated on a build.
 * - **`include` names the emitted declaration explicitly.** TypeScript's
 *   wildcard expansion skips dot-directories and `.nuxt` is one. Nothing
 *   imports the map — an augmentation reaches a program by membership alone —
 *   so if it were not named here it would simply be absent, and every
 *   assertion below would go green against an interface that stayed empty.
 */
function buildAppTree(spec: AppSpec): AppTree {
  const root = join(ROOT, spec.name)
  mkdirSync(root, { recursive: true })
  symlinkSync(
    join(PACKAGE_ROOT, 'node_modules'),
    join(root, 'node_modules'),
    'junction'
  )

  for (const [path, contents] of Object.entries(appFiles(spec.definitions))) {
    write(root, path, contents)
  }

  const emitted = emitMap(appHandlers(root), {
    nitroOptions: {
      buildDir: spec.pretendBuildDir ?? join(root, BUILD_DIR),
      srcDir: join(root, 'server'),
      alias: {},
    },
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
              join(PACKAGE_ROOT, 'src/runtime/types/index.ts'),
            ],
            '@dphonys/nuxt-handler-errors/server': [
              join(PACKAGE_ROOT, 'src/runtime/server/index.ts'),
            ],
            '@dphonys/nuxt-handler-errors/shared': [
              join(PACKAGE_ROOT, 'src/runtime/shared/index.ts'),
            ],
          },
        },
        include: [MAP_PATH],
      },
      undefined,
      2
    )}\n`
  )

  return { root, emitted }
}

/** A compiler's view of a tree: the same bytes, compiled by `ts`. */
function attach(tree: AppTree): App {
  return {
    ...tree,
    compile: (name, source) =>
      compileFixture(
        join(tree.root, 'tsconfig.json'),
        write(tree.root, name, source)
      ),
  }
}

function write(root: string, relativePath: string, contents: string): string {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)

  return path
}

/**
 * What every consumer fixture opens with: the map's interface, and the
 * assertion vocabulary inlined rather than imported, so a fixture is one file
 * with no reach back into this suite.
 */
const CONSUMER_PRELUDE = [
  `import type { KnownApiErrors } from '@dphonys/nuxt-handler-errors/types'`,
  ``,
  `type Equal<X, Y> =`,
  `  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false`,
  `type Expect<T extends true> = T`,
  `type IsAny<T> = 0 extends 1 & T ? true : false`,
  `type IsNever<T> = [T] extends [never] ? true : false`,
  ``,
]

const TREE_A = buildAppTree({ name: 'app-a', definitions: DEFINITIONS_A })
const TREE_B = buildAppTree({ name: 'app-b', definitions: DEFINITIONS_B })

/**
 * The same emitter, the same app as `TREE_A`, one thing changed: the map is
 * written into `.nuxt/types` but emitted as though it were going somewhere
 * else, so every `import("…")` in it points at a file that is not there.
 */
const TREE_BROKEN = buildAppTree({
  name: 'app-broken',
  definitions: DEFINITIONS_A,
  pretendBuildDir: join(ROOT, 'app-broken/elsewhere/deeper'),
})

describe('the emitted map', () => {
  const APP_A = attach(TREE_A)
  const APP_B = attach(TREE_B)

  describe('the emitted map, compiled', () => {
    const compilation = APP_A.compile(
      'consumer.ts',
      [
        ...CONSUMER_PRELUDE,
        `export type Declared = KnownApiErrors['/api/users/:id']['get']`,
        `export type Defaulted = KnownApiErrors['/api/y']['default']`,
        `export type Unbranded = KnownApiErrors['/api/legacy']['get']`,
        `export type Indexed = KnownApiErrors['/api/indexed']['get']`,
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
      // The one check that catches a map that resolved to nothing. Tags render
      // **double**-quoted: they are synthesised by the checker out of an object
      // literal's inferred type rather than written in an annotation.
      const rendered = compilation.renderHover('Declared')

      expect(rendered).toContain('"user-not-found"')
      expect(rendered).toContain('"user-suspended"')
      expect(rendered).toContain('userId: string')
    })

    it('applies Serialize around the extractor, so a Date arrives as a string', () => {
      // Direct evidence that the `Simplify<Serialize<…>>` the emitter writes
      // around `KnownErrorsOfHandler` is doing work: the definition declares
      // `until: Date`, and the map is the wire's view of it.
      expect(compilation.renderHover('Declared')).toContain('until: string')
    })

    it('neutralises the index-signature leak at this position', () => {
      // `KnownErrorsOfHandler` really does hand back `unknown` here — but the
      // map never emits the extractor bare. `Serialize<unknown>` is `never`, so
      // the wrapper mandated for wire-honesty closes this door as a side
      // effect. No extra arm is needed in the extractor for anything reachable
      // through the map.
      expect(compilation.renderHover('Indexed')).toBe('never')
    })

    it('extracts nothing from an unbranded route, without special-casing it', () => {
      // Keying every route costs nothing precisely because of this.
      expect(compilation.renderHover('Unbranded')).toBe('never')
    })
  })

  describe('the emitted map, when it resolves to nothing', () => {
    /**
     * `TREE_BROKEN`, compiled. **Nothing complains.** An unresolved
     * `import("…")` yields TypeScript's *error type*, which renders as `any`
     * but is not `any`: it propagates through every conditional it is fed to
     * and satisfies whatever constraint it lands against. The fixture below
     * pins that down the only way it can be pinned down — it asserts
     * `IsAny<Declared>` is `false` **and** that it is `true`, in the same
     * program, and the program compiles clean. No inhabited type satisfies
     * both, so the extraction guard never fires and the entry stays `any` all
     * the way to the call site.
     */
    const broken = attach(TREE_BROKEN)

    const compilation = broken.compile(
      'consumer.ts',
      [
        ...CONSUMER_PRELUDE,
        `export type Declared = KnownApiErrors['/api/users/:id']['get']`,
        ``,
        `type _tags = Expect<Equal<Declared['tag'], 'user-not-found' | 'user-suspended'>>`,
        `type _notCollapsed = Expect<Equal<IsAny<Declared>, false>>`,
        `type _isAnyToo = Expect<Equal<IsAny<Declared>, true>>`,
        `type _notEmpty = Expect<Equal<IsNever<Declared>, false>>`,
        ``,
      ].join('\n')
    )

    it('is swallowed whole: the structural assertions are green and vacuous', () => {
      // Every one of the four assertions above is false of this map, and not
      // one of them fails. Two of them contradict each other outright, which is
      // what makes this a measurement of the error type rather than a guess
      // about it.
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
      const control = APP_A.compile(
        'control.ts',
        [
          ...CONSUMER_PRELUDE,
          `type Declared = KnownApiErrors['/api/users/:id']['get']`,
          ``,
          `type _notAny = Expect<Equal<IsAny<Declared>, false>>`,
          `type _isAny = Expect<Equal<IsAny<Declared>, true>>`,
          ``,
        ].join('\n')
      )

      expect(
        control.diagnostics.filter(
          (diagnostic) =>
            diagnostic.code === 2344 && diagnostic.message.includes('true')
        )
      ).not.toEqual([])
    })
  })

  describe('path-referentiality, against two apps that really do differ', () => {
    const compilation = APP_B.compile(
      'consumer.ts',
      [
        ...CONSUMER_PRELUDE,
        `export type Declared = KnownApiErrors['/api/users/:id']['get']`,
        ``,
        `type _tags = Expect<Equal<Declared['tag'], 'account-locked' | 'rate-limited' | 'quota-exceeded'>>`,
        ``,
      ].join('\n')
    )

    it('emits byte-identical text for two different definition modules', () => {
      // The path-referentiality mandate, end to end. Two apps, the same routes
      // at the same relative paths, definitions that share not one tag — and
      // the emitted map is the same string. This is the property that lets
      // Nitro never regenerate route types on a content change, and it is why
      // no runtime value map may ever be emitted.
      expect(APP_A.emitted).toBe(APP_B.emitted)
    })

    it('compiles clean against the other definitions', () => {
      assertNoDiagnostics(compilation)
    })

    it('and the compiler still tells the two apart', () => {
      // The half a string comparison cannot make: byte identity would be
      // worthless if the type were stale too. It is not, because the emitted
      // text is an import expression the compiler re-resolves against whatever
      // is on disk now.
      const rendered = compilation.renderHover('Declared')

      expect(rendered).toContain('"account-locked"')
      expect(rendered).toContain('"rate-limited"')
      expect(rendered).not.toContain('"user-not-found"')
    })
  })
})
