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
import { BETTER_HANDLER_MAP, emitMap } from '../../src/build/emit-map'
import { routeHandlersOf } from '../../src/build/routes'
import type { HandlerEntry } from '../../src/build/routes'
import { assertNoDiagnostics, compileForHover } from './compile-harness'
import type { Compilation } from './compile-harness'

/**
 * The generated map, compiled: `test/unit/emit-map.test.ts` asserts what the
 * renderer writes, this asserts the text means something. An unresolved
 * `import('…')` in a `.d.ts` produces no diagnostic and collapses silently,
 * so every claim below is read back as rendered text, which refuses `any`.
 * Built in a temporary tree, because the map is a set of paths relative to
 * where it is written; the route list goes through the route discovery seam
 * as Nitro's would.
 */

const TYPE_SUITE = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_ROOT = resolve(TYPE_SUITE, '../..')

/** Where the map lands in an app: Nitro's `typesDir`. */
const MAP_PATH = '.nuxt/types/better-handler.d.ts'

/** The route keys Nitro's own route types would declare, for `MatchedRoutes`. */
const NITRO_ROUTES_PATH = '.nuxt/types/nitro-routes.d.ts'

const ROOT = mkdtempSync(join(tmpdir(), 'better-handler-map-'))

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

/** Two declaration modules for the same routes, declaring different failures. */
const DEFINITIONS_A = [
  `import { defineError } from '@dphonys/better-handler/server'`,
  `import { z } from 'zod'`,
  ``,
  `export const orderErrors = {`,
  `  ...defineError('order-not-found', { status: 404, schema: z.object({ id: z.string().transform(Number), at: z.date() }) }),`,
  `  'order-locked': { status: 409 },`,
  `}`,
  ``,
].join('\n')

const DEFINITIONS_B = [
  `import { defineError } from '@dphonys/better-handler/server'`,
  `import { z } from 'zod'`,
  ``,
  `export const orderErrors = {`,
  `  ...defineError('order-archived', { status: 410, schema: z.object({ until: z.string() }) }),`,
  `  'rate-limited': { status: 429 },`,
  `}`,
  ``,
].join('\n')

/** The route files every app shares; only the declarations differ. */
function appFiles(definitions: string) {
  return {
    'server/errors/orders.ts': definitions,

    'server/api/orders/[id].get.ts': [
      `import { defineBetterEventHandler } from '@dphonys/better-handler/server'`,
      `import { orderErrors } from '../../errors/orders'`,
      ``,
      `export default defineBetterEventHandler({ errors: orderErrors }, () => ({ id: 7 }))`,
      ``,
    ].join('\n'),

    // A `default`-keyed route: no method in the file name.
    'server/api/y.ts': [
      `import { defineBetterEventHandler } from '@dphonys/better-handler/server'`,
      `import { orderErrors } from '../errors/orders'`,
      ``,
      `export default defineBetterEventHandler({ errors: orderErrors }, () => null)`,
      ``,
    ].join('\n'),

    // A route declaring `input` beside its `errors`: the Built-in
    // validation-failed variant joins the declared ones.
    'server/api/search.get.ts': [
      `import { defineBetterEventHandler } from '@dphonys/better-handler/server'`,
      `import { z } from 'zod'`,
      `import { orderErrors } from '../errors/orders'`,
      ``,
      `export default defineBetterEventHandler({ input: { query: z.object({ q: z.string() }) }, errors: orderErrors }, () => null)`,
      ``,
    ].join('\n'),

    // A route declaring only `input`: the variant is its whole union.
    'server/api/lookup.get.ts': [
      `import { defineBetterEventHandler } from '@dphonys/better-handler/server'`,
      `import { z } from 'zod'`,
      ``,
      `export default defineBetterEventHandler({ input: { query: z.object({ q: z.string() }) } }, () => null)`,
      ``,
    ].join('\n'),

    // A body, a coerce key in it: our map keeps the schema's input exactly.
    'server/api/orders.post.ts': [
      `import { defineBetterEventHandler } from '@dphonys/better-handler/server'`,
      `import { z } from 'zod'`,
      ``,
      `export default defineBetterEventHandler({ input: { body: z.object({ sku: z.string(), qty: z.coerce.number(), note: z.string().transform((note) => note.length).optional() }) } }, () => null)`,
      ``,
    ].join('\n'),

    // Not this package's, and keyed anyway: what makes the lookup total.
    'server/api/legacy.get.ts': [
      `import { defineEventHandler } from 'h3'`,
      ``,
      `export default defineEventHandler(() => ({ legacy: true }))`,
      ``,
    ].join('\n'),

    // A JavaScript module the compiler cannot resolve from the map, as a
    // module's own `.mjs` route or Nuxt's renderer is: the import is the
    // compiler's error type, which must not reach a call site as `any`.
    'server/api/shipped.get.mjs': [
      `export default () => ({ shipped: true })`,
      ``,
    ].join('\n'),

    // An index signature would satisfy a string-keyed slot; the private
    // symbol key and `Wire` keep it out.
    'server/api/indexed.get.ts': [
      `const handler: { [key: string]: unknown } = {}`,
      ``,
      `export default handler`,
      ``,
    ].join('\n'),
  }
}

/** The handler list Nitro would have scanned for `appFiles`. */
function appHandlers(root: string): HandlerEntry[] {
  return [
    {
      route: '/api/orders/:id',
      method: 'get',
      handler: join(root, 'server/api/orders/[id].get.ts'),
    },
    { route: '/api/y', handler: join(root, 'server/api/y.ts') },
    {
      route: '/api/search',
      method: 'get',
      handler: join(root, 'server/api/search.get.ts'),
    },
    {
      route: '/api/lookup',
      method: 'get',
      handler: join(root, 'server/api/lookup.get.ts'),
    },
    {
      route: '/api/orders',
      method: 'post',
      handler: join(root, 'server/api/orders.post.ts'),
    },
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
    {
      route: '/api/shipped',
      method: 'get',
      handler: join(root, 'server/api/shipped.get.mjs'),
    },
  ]
}

const NITRO_ROUTES = [
  `declare module 'nitropack/types' {`,
  `  interface InternalApi {`,
  `    '/api/orders/:id': { get: unknown }`,
  `    '/api/y': { default: unknown }`,
  `    '/api/search': { get: unknown }`,
  `    '/api/lookup': { get: unknown }`,
  `    '/api/orders': { post: unknown }`,
  `    '/api/legacy': { get: unknown }`,
  `    '/api/indexed': { get: unknown }`,
  `    '/api/shipped': { get: unknown }`,
  `  }`,
  `}`,
  `export {}`,
  ``,
].join('\n')

interface App {
  readonly emitted: string
  /** Compile one consumer file inside this app, with the map in the program. */
  readonly compile: (name: string, source: string) => Compilation
}

function write(root: string, relativePath: string, contents: string): string {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)

  return path
}

/**
 * Materialise one app: route files, the emitted map, Nitro's route keys and
 * a tsconfig. `node_modules` is the package's, so `zod` and `h3` resolve; the
 * package's own specifiers are mapped onto `src/`; `include` names the map,
 * because an augmentation reaches a program by membership alone and the
 * wildcard skips the dot-directory it lives in.
 */
function buildApp(
  name: string,
  definitions: string,
  pretendBuildDir?: string
): App {
  const root = join(ROOT, name)
  mkdirSync(root, { recursive: true })
  symlinkSync(
    join(PACKAGE_ROOT, 'node_modules'),
    join(root, 'node_modules'),
    'junction'
  )

  for (const [path, contents] of Object.entries(appFiles(definitions))) {
    write(root, path, contents)
  }

  const routes = routeHandlersOf(appHandlers(root), {
    buildDir: pretendBuildDir ?? join(root, '.nuxt'),
    srcDir: join(root, 'server'),
    alias: {},
  })
  const emitted = emitMap(routes, BETTER_HANDLER_MAP)

  write(root, MAP_PATH, emitted)
  write(root, NITRO_ROUTES_PATH, NITRO_ROUTES)
  write(
    root,
    'tsconfig.json',
    `${JSON.stringify(
      {
        extends: join(TYPE_SUITE, 'tsconfig.fixtures.json'),
        compilerOptions: {
          paths: Object.fromEntries(
            ['types', 'server', 'shared'].map((entry) => [
              `@dphonys/better-handler/${entry}`,
              [join(PACKAGE_ROOT, `src/runtime/${entry}/index.ts`)],
            ])
          ),
        },
        include: [MAP_PATH, NITRO_ROUTES_PATH],
      },
      undefined,
      2
    )}\n`
  )

  return {
    emitted,
    compile: (file, source) =>
      compileForHover(join(root, 'tsconfig.json'), write(root, file, source)),
  }
}

/** What every consumer opens with: the assertions inlined, one file each. */
const PRELUDE = [
  `import type { KnownApiErrors, KnownApiRequestInputs, KnownErrorBody, KnownErrorFor, KnownErrorsOfRoute, RequestFailed, RequestInputOfRoute, TryResult } from '@dphonys/better-handler/types'`,
  `import type { NuxtError } from 'nuxt/app'`,
  ``,
  `type Equal<X, Y> =`,
  `  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false`,
  `type Expect<T extends true> = T`,
  `type IsNever<T> = [T] extends [never] ? true : false`,
  ``,
]

const APP_A = buildApp('app-a', DEFINITIONS_A)
const APP_B = buildApp('app-b', DEFINITIONS_B)

describe('the emitted map, compiled', () => {
  const compilation = APP_A.compile(
    'consumer.ts',
    [
      ...PRELUDE,
      `export type Declared = KnownApiErrors['/api/orders/:id']['get']`,
      `export type Defaulted = KnownApiErrors['/api/y']['default']`,
      `export type Unbranded = KnownApiErrors['/api/legacy']['get']`,
      `export type Indexed = KnownApiErrors['/api/indexed']['get']`,
      ``,
      `type Expected = { _tag: 'order-not-found'; id: number; at: string } | { _tag: 'order-locked' }`,
      `type _declared = Expect<Equal<Declared, Expected>>`,
      `type _defaulted = Expect<Equal<Defaulted, Expected>>`,
      ``,
      `export type ByPath = KnownErrorsOfRoute<'/api/orders/7'>`,
      `export type ByUpperMethod = KnownErrorsOfRoute<'/api/orders/7', 'GET'>`,
      `export type ByDefault = KnownErrorsOfRoute<'/api/y', 'post'>`,
      `export type NoMethod = KnownErrorsOfRoute<'/api/orders/7', 'post'>`,
      `type _byPath = Expect<Equal<ByPath, Expected>>`,
      `type _byUpper = Expect<Equal<ByUpperMethod, Expected>>`,
      `type _byDefault = Expect<Equal<ByDefault, Expected>>`,
      `type _noMethod = Expect<IsNever<NoMethod>>`,
      ``,
      `type ValidationFailed = { _tag: 'validation-failed'; issues: { source: 'route' | 'query' | 'headers' | 'body'; message: string; path: (string | number)[] }[] }`,
      `export type Validated = KnownErrorsOfRoute<'/api/search'>`,
      `export type InputOnly = KnownErrorsOfRoute<'/api/lookup'>`,
      `type _validated = Expect<Equal<Validated, Expected | ValidationFailed>>`,
      `type _inputOnly = Expect<Equal<InputOnly, ValidationFailed>>`,
      ``,
      `export type Thrown = KnownErrorFor<'/api/orders/7'>`,
      `export type Vanilla = KnownErrorFor<'/api/legacy'>`,
      `export type Unresolved = KnownErrorFor<'/api/shipped'>`,
      `export type UnresolvedErrors = KnownErrorsOfRoute<'/api/shipped'>`,
      `type _thrown = Expect<Equal<Thrown, NuxtError<KnownErrorBody<Expected>>>>`,
      `type _vanilla = Expect<Equal<Vanilla, NuxtError<unknown>>>`,
      `type _unresolved = Expect<Equal<Unresolved, NuxtError<unknown>>>`,
      ``,
      `export type Tried = TryResult<{ id: number }, ByPath | RequestFailed>`,
      `export function handled(result: Tried): string {`,
      `  if (result.error === undefined) return String(result.data.id)`,
      `  switch (result.error._tag) {`,
      `    case 'order-not-found': return result.error.at`,
      `    case 'order-locked': return 'locked'`,
      `    case 'request-failed': return String(result.error.status)`,
      `  }`,
      `}`,
      ``,
    ].join('\n')
  )

  it('compiles clean, with the map in the program', () => {
    assertNoDiagnostics(compilation)
  })

  it('carries the route’s real tags and fields, through JSON', () => {
    // The one check that catches a map that resolved to nothing.
    const rendered = compilation.renderHover('Declared')

    expect(rendered).toContain('_tag: "order-not-found"')
    expect(rendered).toContain('_tag: "order-locked"')
    expect(rendered).toContain('id: number')
    // Declared as a `Date`; the map is what arrives.
    expect(rendered).toContain('at: string')
  })

  it('finds a route by its request path and either method case', () => {
    expect(compilation.renderHover('ByPath')).toBe(
      compilation.renderHover('Declared')
    )
    expect(compilation.renderHover('ByUpperMethod')).toBe(
      compilation.renderHover('Declared')
    )
  })

  it('carries the Built-in validation-failed variant for a route declaring input', () => {
    // The issues' structure is the `Equal` assertions' above; the rendering
    // proves the lookup resolved rather than collapsed.
    const rendered = compilation.renderHover('InputOnly')

    expect(rendered).toMatch(/^\{ _tag: "validation-failed"; issues: /)
    expect(rendered).toContain('ValidationIssue')
    expect(compilation.renderHover('Validated')).toContain(
      '_tag: "validation-failed"'
    )
    expect(compilation.renderHover('Validated')).toContain(
      '_tag: "order-locked"'
    )
  })

  it('types the error a call throws with the Tagged error at data.data', () => {
    expect(compilation.renderHover('Thrown')).toContain(
      'NuxtError<KnownErrorBody<'
    )
    expect(compilation.renderHover('Vanilla')).toBe('NuxtError<unknown>')
  })

  it('extracts nothing from a handler this package did not brand', () => {
    expect(compilation.renderHover('Unbranded')).toBe('never')
    expect(compilation.renderHover('Indexed')).toBe('never')
  })

  it('leaves a route whose module the compiler cannot resolve vanilla, not `any`', () => {
    expect(compilation.renderHover('UnresolvedErrors')).toBe('never')
    expect(compilation.renderHover('Unresolved')).toBe('NuxtError<unknown>')
  })
})

describe('the emitted request-inputs slot, compiled', () => {
  const compilation = APP_A.compile(
    'request-inputs.ts',
    [
      ...PRELUDE,
      `export type Searched = KnownApiRequestInputs['/api/search']['get']`,
      `export type Created = KnownApiRequestInputs['/api/orders']['post']`,
      `export type ErrorsOnly = KnownApiRequestInputs['/api/orders/:id']['get']`,
      `export type Unbranded = KnownApiRequestInputs['/api/legacy']['get']`,
      `export type Indexed = KnownApiRequestInputs['/api/indexed']['get']`,
      ``,
      `type _searched = Expect<Equal<Searched, { query: { q: string } }>>`,
      `type _created = Expect<Equal<Created, { body: { sku: string; qty: unknown; note?: string | undefined } }>>`,
      ``,
      `export type ByPath = RequestInputOfRoute<'/api/search'>`,
      `export type ByUpperMethod = RequestInputOfRoute<'/api/orders', 'POST'>`,
      `export type ByDefault = RequestInputOfRoute<'/api/y', 'patch'>`,
      `export type NoMethod = RequestInputOfRoute<'/api/search', 'post'>`,
      `export type Unresolved = RequestInputOfRoute<'/api/shipped'>`,
      `type _byPath = Expect<Equal<ByPath, Searched>>`,
      `type _byUpper = Expect<Equal<ByUpperMethod, Created>>`,
      `type _byDefault = Expect<Equal<ByDefault, {}>>`,
      `type _noMethod = Expect<IsNever<NoMethod>>`,
      `type _unresolved = Expect<IsNever<Unresolved>>`,
      ``,
    ].join('\n')
  )

  it('compiles clean, with the map in the program', () => {
    assertNoDiagnostics(compilation)
  })

  it('carries each declared source as its schema’s input, a coerce key unknown', () => {
    expect(compilation.renderHover('Searched')).toBe(
      '{ query: { q: string; }; }'
    )
    // Before the transform, and `unknown` rather than nitropack's `{}`.
    expect(compilation.renderHover('Created')).toBe(
      '{ body: { sku: string; qty: unknown; note?: string | undefined; }; }'
    )
  })

  it('finds a route by its request path and either method case', () => {
    expect(compilation.renderHover('ByPath')).toBe(
      compilation.renderHover('Searched')
    )
    expect(compilation.renderHover('ByUpperMethod')).toBe(
      compilation.renderHover('Created')
    )
  })

  it('carries no source for a branded route declaring none', () => {
    expect(compilation.renderHover('ErrorsOnly')).toBe('{}')
    expect(compilation.renderHover('ByDefault')).toBe('{}')
  })

  it('extracts nothing from a handler this package did not brand, or could not resolve', () => {
    expect(compilation.renderHover('Unbranded')).toBe('never')
    expect(compilation.renderHover('Indexed')).toBe('never')
    expect(compilation.renderHover('Unresolved')).toBe('never')
  })
})

describe('the emitted map, when it resolves to nothing', () => {
  // The same app, with the map emitted as though it lived somewhere else: every
  // `import('…')` in it points at nothing, and nothing complains.
  const broken = buildApp(
    'app-broken',
    DEFINITIONS_A,
    join(ROOT, 'app-broken/elsewhere/deeper')
  )

  const compilation = broken.compile(
    'consumer.ts',
    [
      ...PRELUDE,
      `export type Declared = KnownApiErrors['/api/orders/:id']['get']`,
      `type _tags = Expect<Equal<Declared['_tag'], 'order-not-found' | 'order-locked'>>`,
      ``,
    ].join('\n')
  )

  it('is swallowed whole: the structural assertion compiles', () => {
    assertNoDiagnostics(compilation)
  })

  it('is caught by the rendering, which is why every claim above is rendered', () => {
    expect(() => compilation.renderHover('Declared')).toThrow(
      /rendered as `any`/
    )
  })
})

describe('the emitted map is a function of paths', () => {
  const compilation = APP_B.compile(
    'consumer.ts',
    [
      ...PRELUDE,
      `export type Declared = KnownApiErrors['/api/orders/:id']['get']`,
      ``,
    ].join('\n')
  )

  it('is byte-identical for two apps declaring different failures', () => {
    // What lets the map survive an edit to a declaration with nothing
    // regenerating it.
    expect(APP_A.emitted).toBe(APP_B.emitted)
  })

  it('and the compiler still tells the two apps apart', () => {
    const rendered = compilation.renderHover('Declared')

    expect(rendered).toContain('"order-archived"')
    expect(rendered).toContain('"rate-limited"')
    expect(rendered).not.toContain('"order-not-found"')
  })
})
