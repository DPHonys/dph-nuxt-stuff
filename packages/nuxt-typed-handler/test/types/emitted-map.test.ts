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
import { typeMap } from '../../src/build/type-map'
import { assertNoDiagnostics, compileForHover } from './compile-harness'
import type { Compilation } from './compile-harness'

/**
 * The one file both maps are emitted into, compiled - `test/e2e` asserts what
 * the text *says*; this asserts what it *means*. An unresolved `import("…")`
 * in a `.d.ts` produces no diagnostic under `skipLibCheck` and collapses to
 * `any`, so every claim here is a *rendering* one. Built in a temporary tree
 * because the map's whole content is a set of paths relative to where it is
 * written.
 */

const TYPE_SUITE = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_ROOT = resolve(TYPE_SUITE, '../..')

/** The temp tree's build directory, named as Nuxt names the one it hands Nitro. */
const BUILD_DIR = '.nuxt'

/** Where the map lands, relative to an app root. Nitro's `typesDir`. */
const MAP_PATH = `${BUILD_DIR}/types/nuxt-typed-handler.d.ts`

/** The map `src/module.ts` registers, asked for the same text it emits. */
const TYPE_MAP = typeMap('nuxt-typed-handler')

const ROOT = mkdtempSync(join(tmpdir(), 'nuxt-typed-handler-map-'))

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

/**
 * The route files of one app: one route per shape the two slots have to tell
 * apart. Every payload and schema field is named uniquely, so a hover can say
 * which slot it came from.
 */
const APP_FILES = {
  'server/errors/users.ts': [
    `import { defineError } from '@dphonys/nuxt-typed-handler/server'`,
    `import { z } from 'zod'`,
    ``,
    `export const userErrors = defineError({`,
    `  userExists: { status: 409, payload: z.object({ existingId: z.string().transform(Number), until: z.date() }) },`,
    `  userNotFound: { status: 404 },`,
    `})`,
    ``,
  ].join('\n'),

  'server/validation/schemas.ts': [
    `import { z } from 'zod'`,
    ``,
    `export const createUser = z.object({`,
    `  fullName: z.string(),`,
    `  scheduledFor: z.date(),`,
    `})`,
    ``,
    `export const pagination = z.object({`,
    `  page: z.string().transform(Number),`,
    `})`,
    ``,
  ].join('\n'),

  // Both halves declared: this route is keyed in both maps, differently.
  'server/api/users.post.ts': [
    `import { defineTypedEventHandler } from '@dphonys/nuxt-typed-handler/server'`,
    `import { userErrors } from '../errors/users'`,
    `import { createUser, pagination } from '../validation/schemas'`,
    ``,
    `export default defineTypedEventHandler(`,
    `  {`,
    `    validate: { body: createUser, query: pagination },`,
    `    errors: userErrors.pick('userExists'),`,
    `  },`,
    `  (_event, { body, query, errors }) => {`,
    `    if (body.fullName === '') {`,
    `      throw errors.userExists({ existingId: '1', until: new Date() })`,
    `    }`,
    ``,
    `    return { created: body.fullName, page: query.page }`,
    `  },`,
    `)`,
    ``,
  ].join('\n'),

  // `errors` only: nothing declared to send.
  'server/api/users/[id].get.ts': [
    `import { defineTypedEventHandler } from '@dphonys/nuxt-typed-handler/server'`,
    `import { userErrors } from '../../errors/users'`,
    ``,
    `export default defineTypedEventHandler(`,
    `  { errors: userErrors.pick('userNotFound') },`,
    `  (_event, { errors }) => { throw errors.userNotFound() },`,
    `)`,
    ``,
  ].join('\n'),

  // `validate` only: nothing declared to fail with but the built-in variant.
  'server/api/search.get.ts': [
    `import { defineTypedEventHandler } from '@dphonys/nuxt-typed-handler/server'`,
    `import { pagination } from '../validation/schemas'`,
    ``,
    `export default defineTypedEventHandler(`,
    `  { validate: { query: pagination } },`,
    `  (_event, { query }) => ({ page: query.page }),`,
    `)`,
    ``,
  ].join('\n'),

  // Unbranded, and keyed anyway - what makes both lookups total.
  'server/api/legacy.get.ts': [
    `import { defineEventHandler } from 'h3'`,
    ``,
    `export default defineEventHandler(() => ({ legacy: true }))`,
    ``,
  ].join('\n'),
}

/** The handler records Nitro would have scanned for `APP_FILES`. */
function appHandlers(root: string): NitroEventHandler[] {
  return [
    {
      route: '/api/users',
      method: 'post',
      handler: join(root, 'server/api/users.post.ts'),
    },
    {
      route: '/api/users/:id',
      method: 'get',
      handler: join(root, 'server/api/users/[id].get.ts'),
    },
    {
      route: '/api/search',
      method: 'get',
      handler: join(root, 'server/api/search.get.ts'),
    },
    {
      route: '/api/legacy',
      method: 'get',
      handler: join(root, 'server/api/legacy.get.ts'),
    },
  ]
}

interface App {
  /** The emitted text, so a claim can be made about the bytes as well. */
  readonly emitted: string
  /** Compile one consumer fixture inside this app, with the map in scope. */
  readonly compile: (name: string, source: string) => Compilation
}

/**
 * Materialise one app: route files, the emitted map, and a tsconfig. Nothing
 * rewrites a byte of the emitted text. `node_modules` is symlinked so the
 * map's bare `nitropack/types` and both parents' `/types` imports resolve;
 * the umbrella's own specifiers are mapped to `src/` so this is not gated on
 * a build; and `include` must name the emitted declaration explicitly -
 * TypeScript's wildcard expansion skips dot-directories, and an augmentation
 * reaches a program by membership alone, so an unnamed map would simply be
 * absent and every assertion would go green against an empty interface.
 *
 * `pretendBuildDir` hands the emitter a build directory the map is *not*
 * written to - the one knob that breaks every specifier in the emitted file.
 */
function buildApp(name: string, pretendBuildDir?: string): App {
  const root = join(ROOT, name)
  mkdirSync(root, { recursive: true })
  symlinkSync(
    join(PACKAGE_ROOT, 'node_modules'),
    join(root, 'node_modules'),
    'junction'
  )

  for (const [path, contents] of Object.entries(APP_FILES)) {
    write(root, path, contents)
  }

  const emitted = TYPE_MAP.emit(appHandlers(root), {
    buildDir: pretendBuildDir ?? join(root, BUILD_DIR),
    srcDir: join(root, 'server'),
    alias: {},
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
            '@dphonys/nuxt-typed-handler/types': [
              join(PACKAGE_ROOT, 'src/runtime/types/index.ts'),
            ],
            '@dphonys/nuxt-typed-handler/server': [
              join(PACKAGE_ROOT, 'src/runtime/server/index.ts'),
            ],
          },
        },
        include: [MAP_PATH],
      },
      undefined,
      2
    )}\n`
  )

  return {
    emitted,
    compile: (fixture, source) =>
      compileForHover(
        join(root, 'tsconfig.json'),
        write(root, fixture, source)
      ),
  }
}

function write(root: string, relativePath: string, contents: string): string {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)

  return path
}

/** What every consumer fixture opens with: one import per slot's target. */
const CONSUMER_PRELUDE = [
  `import type { KnownApiErrors } from '@dphonys/nuxt-handler-errors/types'`,
  `import type { KnownApiRequestInputs } from '@dphonys/nuxt-typed-handler/types'`,
  ``,
]

/** Both slots of every route, as a consumer reads them. */
const CONSUMER = [
  ...CONSUMER_PRELUDE,
  `export type BothErrors = KnownApiErrors['/api/users']['post']`,
  `export type BothInput = KnownApiRequestInputs['/api/users']['post']`,
  `export type ErrorsOnlyErrors = KnownApiErrors['/api/users/:id']['get']`,
  `export type ErrorsOnlyInput = KnownApiRequestInputs['/api/users/:id']['get']`,
  `export type ValidateOnlyErrors = KnownApiErrors['/api/search']['get']`,
  `export type ValidateOnlyInput = KnownApiRequestInputs['/api/search']['get']`,
  `export type UnbrandedErrors = KnownApiErrors['/api/legacy']['get']`,
  `export type UnbrandedInput = KnownApiRequestInputs['/api/legacy']['get']`,
  ``,
].join('\n')

describe('the emitted map, with both slots in one file', () => {
  const app = buildApp('app')
  const compilation = app.compile('consumer.ts', CONSUMER)

  it('compiles clean, with both augmentations in the program', () => {
    assertNoDiagnostics(compilation)
  })

  it('reads the errors slot through the parent’s extractor, serialised', () => {
    const rendered = compilation.renderHover('BothErrors')

    expect(rendered).toContain('"userExists"')
    expect(rendered).toContain('existingId: number')
    expect(rendered).not.toContain('payload:')
    // The definition declares `until: Date`; `Serialize` is the wire's view.
    expect(rendered).toContain('until: string')
    // The built-in variant every validating route can fail with.
    expect(rendered).toContain('"validationFailed"')
  })

  it('reads the request-inputs slot with no Serialize at all', () => {
    const rendered = compilation.renderHover('BothInput')

    expect(rendered).toContain('body:')
    expect(rendered).toContain('query:')
    // The input side of the schema: `page` before the transform to `number`,
    // and a `Date` the author means to send as a `Date`.
    expect(rendered).toContain('page: string')
    expect(rendered).toContain('scheduledFor: Date')
  })

  it('keeps each map to its own slot, on the route that declares both', () => {
    // The failure this catches is one slot's extractor emitted under the
    // other's interface - which type-checks, and is silently wrong.
    expect(compilation.renderHover('BothErrors')).not.toContain('body:')
    expect(compilation.renderHover('BothInput')).not.toContain('tag:')
  })

  it('answers each half for a route that declared only the other', () => {
    expect(compilation.renderHover('ErrorsOnlyErrors')).toContain(
      '"userNotFound"'
    )
    // Nothing declared to send: an empty input, not a failure to resolve.
    expect(compilation.renderHover('ErrorsOnlyInput')).toBe('{}')

    expect(compilation.renderHover('ValidateOnlyErrors')).toContain(
      '"validationFailed"'
    )
    expect(compilation.renderHover('ValidateOnlyInput')).toContain(
      'page: string'
    )
  })

  it('extracts nothing from an unbranded route in either map', () => {
    expect(compilation.renderHover('UnbrandedErrors')).toBe('never')
    expect(compilation.renderHover('UnbrandedInput')).toBe('never')
  })

  it('imports each extractor from the specifier that owns it, once', () => {
    expect(
      app.emitted.split('\n').filter((line) => line.startsWith('import type'))
    ).toEqual([
      `import type { Serialize, Simplify } from 'nitropack/types'`,
      `import type { KnownErrorsOfHandler } from '@dphonys/nuxt-handler-errors/types'`,
      `import type { RequestInputOfHandler } from '@dphonys/nuxt-handler-validation/types'`,
    ])
  })
})

describe('the emitted map, when it resolves to nothing', () => {
  // The same app, with the map emitted as though it were going somewhere
  // else, so every `import("…")` in it points at nothing. Nothing complains:
  // an unresolved import yields TypeScript's *error type*, which satisfies
  // every constraint a structural assertion could make.
  // One directory *deeper* than the real build directory, so every relative
  // specifier the emitter computes lands one level short of its file.
  const broken = buildApp(
    'app-broken',
    join(ROOT, 'app-broken/elsewhere/deeper')
  )
  const compilation = broken.compile('consumer.ts', CONSUMER)

  it('is swallowed whole, with no diagnostic to show for it', () => {
    assertNoDiagnostics(compilation)
  })

  it('is caught by the rendering harness, in both slots', () => {
    expect(() => compilation.renderHover('BothErrors')).toThrow(
      /rendered as `any`/
    )
    expect(() => compilation.renderHover('BothInput')).toThrow(
      /rendered as `any`/
    )
  })
})
