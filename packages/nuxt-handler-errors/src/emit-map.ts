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

/**
 * What a character is written as inside the single-quoted TypeScript string
 * literals this file emits.
 *
 * All six are here for the reason the quote already was: **a route key is a
 * file name**. It is Nitro's own `mw.route`, derived from a path on disk, and
 * a POSIX file name may contain any byte but `/` and NUL — so every character
 * below is one a route key can really carry.
 *
 * They are not equally bad, and the difference is why the first four are the
 * point of this table:
 *
 * - **`\` and `'` corrupt the literal.** Already handled, and unchanged.
 * - **`\n` and `\r` are a parse error.** A line terminator is forbidden inside
 *   a string literal, so one route key with a newline in it does not produce a
 *   wrong type — it produces an **unterminated string** and takes the whole
 *   generated `.d.ts` down, which is every route rather than one.
 * - **U+2028 and U+2029 are hardening, not a fix.** ES2019's JSON-superset
 *   change made them legal in a string literal and TypeScript follows it, so
 *   nothing here is broken today. They are normalised because they are line
 *   terminators everywhere *else* in the grammar and this file's output is read
 *   by more than one parser.
 *
 * Escaping is the right treatment rather than rejection: the key has to reach
 * the map verbatim or the entry stops matching what Nitro wrote for the same
 * handler (SPEC.md §4.2).
 */
const STRING_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  "'": "\\'",
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

const NEEDS_ESCAPE = /[\\'\n\r\u2028\u2029]/g

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
    sortedEntries(routes).map(([route, methods]) => renderRoute(route, methods))
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
  methods: ReadonlyMap<string, readonly string[]>
): string {
  return [
    `    ${quote(route)}: {`,
    ...sortedEntries(methods).map(
      ([method, declared]) => `      ${quote(method)}: ${declared.join(' | ')}`
    ),
    '    }',
  ].join('\n')
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
  return `'${value.replaceAll(NEEDS_ESCAPE, (char) => STRING_ESCAPES[char] ?? char)}'`
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
