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
import { emitMap, KNOWN_ERRORS_SLOT } from '../../src/emit-map'
import type { EmitMapSlot } from '../../src/emit-map'
import { assertNoDiagnostics, compileFixture } from './compile-harness'
import type { Compilation } from './compile-harness'

/**
 * The emitted map, compiled - `test/unit/emit-map.test.ts` asserts what the
 * emitter writes; this asserts the text *means* something. An unresolved
 * `import("…")` in a `.d.ts` produces no diagnostic under `skipLibCheck` and
 * collapses silently, so the claim here is a *rendering* one. Built in a
 * temporary tree because the map's whole content is a set of paths relative
 * to where it is written.
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
  `import { defineError } from '@dphonys/nuxt-handler-errors/server'`,
  `import { z } from 'zod'`,
  ``,
  `export const userErrors = defineError({`,
  `  'user-not-found': { status: 404, payload: z.object({ userId: z.string().transform(Number), until: z.date() }) },`,
  `  'user-suspended': { status: 403 },`,
  `})`,
  ``,
  `export const firstFactory = 'userNotFound'`,
  ``,
].join('\n')

const DEFINITIONS_B = [
  `import { defineError } from '@dphonys/nuxt-handler-errors/server'`,
  `import { z } from 'zod'`,
  ``,
  `export const userErrors = defineError({`,
  `  'account-locked': { status: 423, payload: z.object({ userId: z.string(), until: z.date() }) },`,
  `  'rate-limited': { status: 429 },`,
  `  'quota-exceeded': { status: 402 },`,
  `})`,
  ``,
  `export const firstFactory = 'accountLocked'`,
  ``,
].join('\n')

/**
 * The route files of one app. Every app shares this layout and differs only
 * in the definitions, which is what makes the path-referentiality assertion a
 * byte comparison.
 */
function appFiles(definitions: string): Record<string, string> {
  return {
    'server/errors/user.ts': definitions,

    'server/api/users/[id].get.ts': [
      `import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'`,
      `import { firstFactory, userErrors } from '../../errors/user'`,
      ``,
      `export default defineCheckedEventHandler(`,
      `  { errors: [...userErrors] },`,
      `  (event, { errors }) => {`,
      `    const id = event.path.slice(1)`,
      `    if (id === '') throw errors[firstFactory]({ userId: id, until: new Date() })`,
      `    return { id }`,
      `  },`,
      `)`,
      ``,
    ].join('\n'),

    // A `default`-keyed route: no method in the file name.
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

    // Unbranded, and keyed anyway - what makes the lookup total.
    'server/api/legacy.get.ts': [
      `import { defineEventHandler } from 'h3'`,
      ``,
      `export default defineEventHandler(() => ({ legacy: true }))`,
      ``,
    ].join('\n'),

    // An index signature satisfies `{ __knownErrors__?: infer E }` with
    // `E = unknown` - the one door `KnownErrorsOfHandler`'s guards do not
    // close. Keyed here so the map answers it with a measurement.
    'server/api/indexed.get.ts': [
      `const handler: { [key: string]: unknown } = {}`,
      ``,
      `export default handler`,
      ``,
    ].join('\n'),
  }
}

/** The handler records Nitro would have scanned for `appFiles`. */
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
 * Materialise one app: route files, the emitted map, and a tsconfig. Nothing
 * rewrites a byte of the emitted text. `node_modules` is symlinked so the
 * map's bare `nitropack/types` import resolves; the published specifiers are
 * mapped to `src/` so this is not gated on a build; and `include` must name
 * the emitted declaration explicitly - TypeScript's wildcard expansion skips
 * dot-directories, and an augmentation reaches a program by membership alone,
 * so an unnamed map would simply be absent and every assertion would go green
 * against an empty interface.
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

/** What every consumer fixture opens with; the assertion vocabulary is
 * inlined so a fixture is one file with no reach back into this suite. */
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

// Same app as `TREE_A`, but the map is emitted as though it were going
// somewhere else, so every `import("…")` in it points at nothing.
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
        `  Equal<Extract<Declared, { tag: 'user-not-found' }>['userId'], number>>`,
        `type _serialized = Expect<Equal<Extract<Declared, { tag: 'user-not-found' }>['until'], string>>`,
        `type _flat = Expect<Equal<'payload' extends keyof Declared ? true : false, false>>`,
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
      // The one check that catches a map that resolved to nothing.
      const rendered = compilation.renderHover('Declared')

      expect(rendered).toContain('"user-not-found"')
      expect(rendered).toContain('"user-suspended"')
      expect(rendered).toContain('userId: number')
      expect(rendered).not.toContain('payload:')
    })

    it('applies Serialize around the extractor, so a Date arrives as a string', () => {
      // The definition declares `until: Date`; the map is the wire's view.
      expect(compilation.renderHover('Declared')).toContain('until: string')
    })

    it('neutralises the index-signature leak at this position', () => {
      // `KnownErrorsOfHandler` hands back `unknown` here, but the map never
      // emits the extractor bare: `Serialize<unknown>` is `never`.
      expect(compilation.renderHover('Indexed')).toBe('never')
    })

    it('extracts nothing from an unbranded route, without special-casing it', () => {
      expect(compilation.renderHover('Unbranded')).toBe('never')
    })
  })

  describe('the emitted map, when it resolves to nothing', () => {
    // `TREE_BROKEN`, compiled - and nothing complains. An unresolved
    // `import("…")` yields TypeScript's *error type*, which satisfies every
    // constraint: the fixture asserts `IsAny<Declared>` is `false` AND `true`
    // in the same program, and it compiles clean.
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
      assertNoDiagnostics(compilation)
    })

    it('is caught by the rendering assertion, which is why one is used', () => {
      expect(() => compilation.renderHover('Declared')).toThrow(
        /rendered as `any`/
      )
    })

    it('and the contradiction is a real diagnostic when the map resolves', () => {
      // The control: without it, "both halves compiled" could just mean
      // `Expect` never checks anything.
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
      // The property that lets Nitro never regenerate route types on a
      // content change, and why no runtime value map may ever be emitted.
      expect(APP_A.emitted).toBe(APP_B.emitted)
    })

    it('compiles clean against the other definitions', () => {
      assertNoDiagnostics(compilation)
    })

    it('and the compiler still tells the two apart', () => {
      // Byte identity would be worthless if the type were stale too.
      const rendered = compilation.renderHover('Declared')

      expect(rendered).toContain('"account-locked"')
      expect(rendered).toContain('"rate-limited"')
      expect(rendered).not.toContain('"user-not-found"')
    })
  })
})

// A throwaway second target. `RouteKind` tells a handler from a bare value,
// so the hover proves the augmentation landed rather than collapsing to the error type.
const THROWAWAY_SPECIFIER = 'throwaway-inputs'
const THROWAWAY_PATH = 'types/throwaway.d.ts'
const THROWAWAY_DECLARATION = [
  `declare module '${THROWAWAY_SPECIFIER}' {`,
  `  export interface RouteKinds {}`,
  `  export type RouteKind<H> = H extends (...args: never[]) => unknown ? 'handler' : 'value'`,
  `}`,
  ``,
].join('\n')

const THROWAWAY_SLOT: EmitMapSlot = {
  interfaceName: 'RouteKinds',
  specifier: THROWAWAY_SPECIFIER,
  // `Serialize` is already on the known-errors slot's line: merged, not repeated.
  imports: [
    { names: ['Serialize'], from: 'nitropack/types' },
    { names: ['RouteKind'], from: THROWAWAY_SPECIFIER },
  ],
  extract: (handlerType) => `Serialize<RouteKind<${handlerType}>>`,
}

/** `buildAppTree`, with two slots and the throwaway declaration in the program. */
function buildTwoSlotTree(name: string): AppTree {
  const root = join(ROOT, name)
  mkdirSync(root, { recursive: true })
  symlinkSync(
    join(PACKAGE_ROOT, 'node_modules'),
    join(root, 'node_modules'),
    'junction'
  )

  for (const [path, contents] of Object.entries(appFiles(DEFINITIONS_A))) {
    write(root, path, contents)
  }

  const emitted = emitMap(appHandlers(root), {
    nitroOptions: {
      buildDir: join(root, BUILD_DIR),
      srcDir: join(root, 'server'),
      alias: {},
    },
    slots: [KNOWN_ERRORS_SLOT, THROWAWAY_SLOT],
  })

  write(root, MAP_PATH, emitted)
  write(root, THROWAWAY_PATH, THROWAWAY_DECLARATION)
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
        include: [MAP_PATH, THROWAWAY_PATH],
      },
      undefined,
      2
    )}\n`
  )

  return { root, emitted }
}

describe('the emitted map, with a second slot', () => {
  const app = attach(buildTwoSlotTree('app-two-slots'))

  const compilation = app.compile(
    'consumer.ts',
    [
      ...CONSUMER_PRELUDE,
      `import type { RouteKinds } from '${THROWAWAY_SPECIFIER}'`,
      ``,
      `export type Declared = KnownApiErrors['/api/users/:id']['get']`,
      `export type Handler = RouteKinds['/api/legacy']['get']`,
      `export type Value = RouteKinds['/api/indexed']['get']`,
      ``,
      `type _tags = Expect<Equal<Declared['tag'], 'user-not-found' | 'user-suspended'>>`,
      `type _handler = Expect<Equal<Handler, 'handler'>>`,
      `type _value = Expect<Equal<Value, 'value'>>`,
      ``,
    ].join('\n')
  )

  it('shares one import line between the slots', () => {
    expect(
      app.emitted.split('\n').filter((line) => line.startsWith('import type'))
    ).toEqual([
      `import type { Serialize, Simplify } from 'nitropack/types'`,
      `import type { KnownErrorsOfHandler } from '@dphonys/nuxt-handler-errors/types'`,
      `import type { RouteKind } from '${THROWAWAY_SPECIFIER}'`,
    ])
  })

  it('compiles clean with both augmentations in the program', () => {
    assertNoDiagnostics(compilation)
  })

  it('resolves the known-errors augmentation as before', () => {
    expect(compilation.renderHover('Declared')).toContain('"user-not-found"')
  })

  it('resolves the second augmentation against the throwaway specifier', () => {
    expect(compilation.renderHover('Handler')).toBe('"handler"')
    expect(compilation.renderHover('Value')).toBe('"value"')
  })
})
