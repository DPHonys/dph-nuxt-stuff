/**
 * The emitter: the text of the generated route → declared-errors map
 * (SPEC.md §4.2), as a pure function.
 *
 * ## Why this is a module of its own
 *
 * SPEC.md §4.6 makes the shape of this a mandate rather than a testing
 * preference: **`(handlers, options) => string`, never logic inlined into
 * `setup()`**. The mandate earns its place on one specific property no other
 * layer can reach cheaply — SPEC.md §4.4's *path-referentiality*, which says the
 * emitted text must be a function of routes and handler **paths** and never of
 * catalogue *content*. Nitro gets away with never regenerating route types on a
 * content change only because its output is an import expression the compiler
 * re-resolves on every edit; anything resolving values at emit time would go
 * stale with no watcher that would ever fix it. As a pure function that claim is
 * two lines of assertion; behind `setup()` it needs a live dev server to observe.
 *
 * It is deliberately **not** under `src/runtime/`. Nothing here ships to a
 * consumer's app — it runs at build time inside `dist/module.mjs`, and the three
 * published specifiers (`.`, `./types`, `./shared`) stay exactly three.
 *
 * ## What it is not coupled to
 *
 * No `Nitro` instance, no Nuxt, no hooks, no filesystem. It takes the handler
 * records Nitro scanned plus the three path options Nitro's own arithmetic
 * reads, and returns a string. Wiring it to `nitro:init` / `types:extend` and
 * `addTypeTemplate` is ticket 07's job and lives in `./module`.
 */

import { resolveNitroPath } from 'nitropack/kit'
import type { Nitro, NitroEventHandler } from 'nitropack/types'
import { isAbsolute, relative, resolve } from 'pathe'

/**
 * The specifier the map augments, and the one it imports the extractor from.
 *
 * Load-bearing and fixed (SPEC.md §4.2): the module augments **its own** name
 * rather than squatting inside `nitropack/types`. Exported so that ticket 07's
 * `nuxt.options.typescript.hoist.push(...)` — without which the augmentation is
 * inert — cannot drift from the string actually emitted.
 */
export const TYPES_SPECIFIER = '@dphonys/nuxt-handler-errors/types'

/**
 * `h3`'s `RouterMethod`, which is `Lowercase<HTTPMethod>` and therefore a closed
 * nine-member union (`h3/dist/index.d.ts:177,268`).
 *
 * Written out rather than derived because it is *data* here — the `expanded`
 * mode iterates it — and a type-level union cannot be iterated at run time.
 *
 * Two guards keep it honest against h3, and **one of them alone is not enough**:
 * `satisfies` rejects a member that is not an h3 method, but a *subset*
 * satisfies it happily, so it says nothing about a member going missing.
 * `Covers` below is the other direction, which is the one SPEC.md §10.3's
 * "closed nine-member union" actually rests on — an h3 release adding a tenth
 * method would otherwise silently under-expand every `default` route.
 */
const ROUTER_METHODS = [
  'connect',
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
] as const satisfies readonly RouterMethod[]

/**
 * Assert at compile time that `Listed` leaves no member of `Union` out. The
 * constraint *is* the assertion; nothing reads the alias.
 */
type Covers<Listed, Union extends Listed> = Union

type _EveryRouterMethodIsListed = Covers<
  (typeof ROUTER_METHODS)[number],
  RouterMethod
>

/** The key a handler with no method of its own is filed under, as Nitro files it. */
const DEFAULT_METHOD = 'default'

/**
 * Nitro's own extension list, verbatim (`nitropack/dist/core/index.mjs:1183`).
 *
 * Kept identical rather than "improved": the specifier this strips an extension
 * from has to be the same one Nitro writes into `nitro-routes.d.ts` for the same
 * handler, or the two files disagree about what a route's module is.
 */
const SOURCE_EXTENSION = /\.(?:js|mjs|cjs|ts|mts|cts|tsx|jsx)$/

/** Matches a specifier TypeScript and Node both read as *relative*. */
const RELATIVE_SPECIFIER = /^\.\.?\//

type RouterMethod = NonNullable<NitroEventHandler['method']>

/**
 * How `default` routes are keyed.
 *
 * - `presence` — SPEC.md §10.3's chosen Option 1. A route with no
 *   method-specific handler keeps a single `default` key, and the type-level
 *   lookup (ticket 08) falls back to it **on key presence**, mirroring h3's
 *   dispatcher.
 * - `expanded` — SPEC.md §10.3's documented Option 2, and the reason it is
 *   shipped rather than merely written down is below.
 */
export type MethodKeyMode = 'presence' | 'expanded'

/**
 * The slice of `Nitro['options']` the path arithmetic reads.
 *
 * Narrowed rather than taking the whole options object so that the emitter's
 * inputs are visible in its signature: `buildDir` says where the file will be
 * written, `srcDir` and `alias` are what `resolveNitroPath` resolves a handler
 * against. A full `Nitro['options']` satisfies it, which is all ticket 07 needs.
 */
export type NitroPathOptions = Pick<
  Nitro['options'],
  'alias' | 'buildDir' | 'srcDir'
>

export interface EmitMapOptions {
  /**
   * Nitro's resolved options. `nitro.options` from the `nitro:init` closure —
   * the instance itself is deliberately not a parameter.
   */
  readonly nitroOptions: NitroPathOptions

  /**
   * Defaults to `presence`.
   *
   * **The trigger condition for switching, recorded here and not only in
   * SPEC.md §10.3: it is the added conditional depth being what tips this
   * repo's compiler over.** `presence` costs the consumption site a second
   * `MatchedRoutes` traversal plus two conditionals, in exactly the
   * deferred-generic position where research 02 measured `TS2321 Excessive
   * stack depth` on the pinned bridge. The ticket-09 prototype did *not*
   * reproduce that, which is why Option 1 is the default — but the evidence for
   * it is **one app with six routes**, and nothing measured says a large app
   * will not hit it. `expanded` moves the fallback out of the type level and
   * into this file, leaving consumption a bare index with zero conditionals, at
   * the cost of a nine-fold expansion of every catch-all route.
   */
  readonly methodKeys?: MethodKeyMode
}

/**
 * Render the generated map (SPEC.md §4.2).
 *
 * `handlers` is `[...nitro.scannedHandlers, ...nitro.options.handlers]` — Nitro's
 * own array, concatenated in Nitro's own order. The loop below is
 * `nitropack/dist/core/index.mjs:1177-1190` re-run rather than reimplemented, so
 * `**`, `**:slug`, `:id` and `(group)` handling comes out identical **by
 * construction**. Nitro's already-stringified type expressions are not an input
 * and could not be: by the time they exist the handler file path survives only
 * as text inside one.
 *
 * Three deliberate divergences from Nitro's loop, each a ticket-06 criterion:
 *
 * 1. **Method keys are lowercased.** Filesystem scanning guarantees lowercase,
 *    but `addServerHandler` passes `method` through unmodified, and SPEC.md
 *    §4.3 mandate 2 normalises the *lookup* side with `Lowercase<M>`.
 * 2. **Keys are sorted.** Nitro emits in scan order. Sorting makes the output a
 *    function of the route *set* rather than of the order two arrays happened to
 *    be concatenated in, which is what lets the path-referentiality assertion be
 *    a byte comparison. Union members keep handler order, since Nitro's later
 *    handler is the one that wins at run time.
 * 3. **A relative specifier is forced to start with `./`, unless it is already
 *    absolute.** Nitro's own arithmetic does neither, so a handler resolving
 *    into the types directory itself emits a bare specifier — read as a package
 *    name, not a path — and a handler on another Windows drive emits an
 *    absolute path that `./` would corrupt. Both resolve to nothing silently
 *    under `skipLibCheck`, which is the failure mode this whole file is
 *    careful about.
 *
 * Every route Nitro knows is keyed, not only branded ones (SPEC.md §4.2). That
 * is what makes ticket 08's lookup total and lets Nitro's `MatchedRoutes` be
 * reused verbatim as the indexer; it costs nothing, because an unbranded handler
 * extracts to `never` naturally.
 */
export function emitMap(
  handlers: readonly NitroEventHandler[],
  options: EmitMapOptions
): string {
  const { nitroOptions } = options

  // Nitro's `typesDir` (`nitropack/dist/core/index.mjs:1176`). Nuxt hands Nitro
  // its own `buildDir`, so the emitted file lands beside `nitro-routes.d.ts` and
  // the relative handler paths in the two files are byte-identical — which is
  // why no import-path rewriting is needed anywhere (SPEC.md §4.2).
  const typesDir = resolve(nitroOptions.buildDir, 'types')

  // A `Map` rather than an object literal: route keys come from the filesystem,
  // and `__proto__` is a legal directory name.
  const routes = new Map<string, Map<string, string[]>>()

  for (const handler of handlers) {
    // Nitro's own guard. `handler` is typed `string` but Nitro's dev handlers
    // carry a function, and a route-less entry is middleware.
    if (typeof handler.handler !== 'string' || !handler.route) continue

    // `||`, not `??`, because Nitro writes `mw.method || "default"` and this
    // loop is that loop. `method` is typed `RouterMethod`, so the difference is
    // only reachable the same way an uppercased method is — through a module
    // that hands `addServerHandler` a value the type never permitted.
    const method = (handler.method || DEFAULT_METHOD).toLowerCase()
    const methods = getOrCreate(routes, handler.route, () => new Map())
    const declared = getOrCreate(methods, method, () => [])

    declared.push(
      declaredUnionFor(specifierFor(handler.handler, typesDir, nitroOptions))
    )
  }

  return renderFile(
    sortedEntries(routes).map(([route, methods]) =>
      renderRoute(route, methods, options)
    )
  )
}

/**
 * The map a build has to write **before Nitro exists**.
 *
 * `nuxi dev` runs `writeTypes` and `buildNuxt` in a `Promise.all`, so the type
 * template can be asked for its contents before `nitro:init` has fired, and a
 * `/// <reference>` to a file that is not a module is a dangling one
 * (SPEC.md §4.2). This is the seed that keeps it valid until the `types:extend`
 * re-render replaces it a beat later.
 *
 * It lives here rather than in `./module` for one reason: it is the *same file
 * shell*, and two spellings of that shell would be free to drift — a different
 * banner, a different specifier, a missing `export {}` — with nothing to notice.
 * `renderFile` is the single authority and this is it applied to no routes.
 */
export const EMPTY_MAP: string = renderFile([])

/**
 * The file the emitter writes, given its route blocks.
 *
 * The `import type` lines stay even when there are no routes: an unused type
 * import in a `.d.ts` costs nothing, and keeping one shell rather than two is
 * what makes {@link EMPTY_MAP} provably the same file as a populated map.
 */
function renderFile(routeBlocks: readonly string[]): string {
  return [
    '// Generated by @dphonys/nuxt-handler-errors — do not edit',
    `import type { Serialize, Simplify } from 'nitropack/types'`,
    `import type { ExtractErrorsSafe } from ${quote(TYPES_SPECIFIER)}`,
    `declare module ${quote(TYPES_SPECIFIER)} {`,
    '  interface TypedApiErrors {',
    ...routeBlocks,
    '  }',
    '}',
    // Makes this a module rather than an ambient declaration, which is what
    // makes the block above an *augmentation* of `TypedApiErrors` instead of a
    // fresh global one. Nitro does exactly this
    // (`nitropack/dist/core/index.mjs:1260-1262`).
    'export {}',
    '',
  ].join('\n')
}

function renderRoute(
  route: string,
  methods: ReadonlyMap<string, readonly string[]>,
  options: EmitMapOptions
): string {
  const keyed =
    options.methodKeys === 'expanded' ? expandDefaultKey(methods) : methods

  return [
    `    ${quote(route)}: {`,
    ...sortedEntries(keyed).map(
      ([method, declared]) => `      ${quote(method)}: ${declared.join(' | ')}`
    ),
    '    }',
  ].join('\n')
}

/**
 * SPEC.md §10.3's Option 2, applied to one route.
 *
 * Every `default` route becomes the nine `RouterMethod` keys minus any method
 * with its own handler file, and the `default` key is dropped. A route that
 * never had a `default` key is returned untouched — there is nothing to expand,
 * and inventing keys for methods the route does not serve would contradict
 * Nitro's `AvailableRouterMethod`, which is what already makes such a call
 * `TS2769`.
 */
function expandDefaultKey(
  methods: ReadonlyMap<string, readonly string[]>
): ReadonlyMap<string, readonly string[]> {
  const fallback = methods.get(DEFAULT_METHOD)
  if (fallback === undefined) return methods

  const expanded = new Map<string, readonly string[]>(
    [...methods].filter(([method]) => method !== DEFAULT_METHOD)
  )

  for (const method of ROUTER_METHODS) {
    // A method with its own handler file wins: it is the one h3 dispatches to.
    if (!expanded.has(method)) expanded.set(method, fallback)
  }

  return expanded
}

/**
 * One handler's contribution to a route+method entry.
 *
 * `Serialize` and `Simplify` come from `nitropack/types` and are applied
 * **here**, around the extractor, rather than inside `ExtractErrorsSafe`: the
 * extractor's job is to read the brand off a handler type, and serialization is
 * a property of the *wire*, not of the declaration (SPEC.md §4.2). The pairing
 * is proven lossless on discriminated unions and is what makes a `Date`-carrying
 * payload honest at the client for free.
 *
 * `Serialize` carries a second load here, measured rather than assumed:
 * `ExtractErrorsSafe` answers `unknown` for a handler type with an index
 * signature — the poison SPEC.md §4.3 mandate 1 exists to stop, through a door
 * its `IsAny` arm does not cover — and `Serialize<unknown>` is `never`. The
 * wrapper closes that door at this position, which is why the extractor needs
 * no extra arm for anything the map can reach.
 *
 * `Flatten` is deliberately absent: indexing out of the map evaluates on its
 * own, and §8.3(a)'s alias belongs in the later tickets' *type-argument*
 * positions.
 */
function declaredUnionFor(specifier: string): string {
  return `Simplify<Serialize<ExtractErrorsSafe<typeof import(${quote(specifier)}).default>>>`
}

/**
 * The handler's module specifier, relative to the directory the map is written
 * into (SPEC.md §4.2).
 *
 * Three pieces, and each is load-bearing:
 *
 * - **`resolveNitroPath`** is Nitro's own resolver, so `~/`, `#imports` and every
 *   other configured alias, plus `{{ template }}` params, resolve exactly as
 *   they do for `nitro-routes.d.ts`. Reimplementing alias resolution here would
 *   be a second, drifting copy.
 * - **`relative` is pathe's**, so the result uses POSIX separators whatever the
 *   platform handed in. A Windows backslash in an emitted module specifier is
 *   an escape sequence, not a path separator.
 * - **The extension is stripped and `./` is forced.** `pathe.relative` returns a
 *   bare name for a sibling, and a bare specifier in a `.d.ts` is a package
 *   name — which resolves to nothing, silently, under `skipLibCheck`.
 *
 * The one input `relative` cannot express as a relative path is a handler on
 * another Windows drive: it hands back the absolute path unchanged. Prefixing
 * an absolute path with `./` would produce `./D:/…`, which is the same silent
 * nothing, so it is emitted as-is — which TypeScript does resolve.
 */
function specifierFor(
  handlerPath: string,
  typesDir: string,
  nitroOptions: NitroPathOptions
): string {
  // Widening cast: `resolveNitroPath` asks for the whole options object but
  // reads only `srcDir`, `alias` and — for `{{ }}` templates — arbitrary
  // properties of whatever it was handed, which is the caller's own object.
  const resolved = resolveNitroPath(
    handlerPath,
    nitroOptions as Nitro['options']
  )
  const specifier = relative(typesDir, resolved).replace(SOURCE_EXTENSION, '')

  return RELATIVE_SPECIFIER.test(specifier) || isAbsolute(specifier)
    ? specifier
    : `./${specifier}`
}

/** A single-quoted TypeScript string literal. Route keys come from the filesystem. */
function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key)
  if (existing !== undefined) return existing

  const created = create()
  map.set(key, created)

  return created
}

/**
 * A map's entries in key order.
 *
 * Codepoint order rather than `localeCompare`: the output has to be identical
 * on every machine that builds the app, and a locale-aware collation is not.
 */
function sortedEntries<V>(map: ReadonlyMap<string, V>): [string, V][] {
  return [...map].toSorted(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )
}
