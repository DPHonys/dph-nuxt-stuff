/**
 * The emitter: the generated route → declared-errors map as a pure
 * `(handlers, options) => string` — never logic inlined into `setup()`. The
 * text must be a function of routes and handler **paths**, never catalogue
 * *content*: anything resolving values at emit time goes stale with no
 * watcher that would fix it. Not under `src/runtime/` — build-time only; the
 * wiring lives in `./module`.
 */

import { resolveNitroPath } from 'nitropack/kit'
import type { Nitro, NitroEventHandler } from 'nitropack/types'
import { isAbsolute, relative, resolve } from 'pathe'

/**
 * The specifier the map augments — the module's **own** name, not Nitro's.
 * Exported so `setup()`'s `typescript.hoist.push(...)` cannot drift from the
 * string actually emitted.
 */
export const TYPES_SPECIFIER = '@dphonys/nuxt-handler-errors/types'

/** The key a handler with no method of its own is filed under, as Nitro files it. */
const DEFAULT_METHOD = 'default'

/**
 * Nitro's own extension list, verbatim — kept identical rather than
 * "improved", or the stripped specifier disagrees with the one Nitro writes
 * into `nitro-routes.d.ts` for the same handler.
 */
const SOURCE_EXTENSION = /\.(?:js|mjs|cjs|ts|mts|cts|tsx|jsx)$/

/** Matches a specifier TypeScript and Node both read as *relative*. */
const RELATIVE_SPECIFIER = /^\.\.?\//

/**
 * Escapes for the emitted single-quoted string literals — a route key is a
 * file name, which may contain any byte but `/` and NUL. `\` and `'` corrupt
 * the literal; `\n`/`\r` are a parse error that takes the whole generated
 * `.d.ts` down; U+2028/29 are hardening for non-TS parsers. Escaping, not
 * rejection: the key must reach the map verbatim or it stops matching
 * Nitro's.
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
 * The slice of `Nitro['options']` the path arithmetic reads, narrowed so the
 * emitter's inputs are visible in its signature. A full `Nitro['options']`
 * satisfies it.
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
 * Render the generated map. The loop below is Nitro's own route-types loop
 * re-run rather than reimplemented, with three deliberate divergences:
 * method keys are lowercased (`addServerHandler` passes `method` through
 * unmodified; the lookup normalises with `Lowercase<M>`); keys are sorted so
 * the output is a function of the route *set*, not concatenation order; and
 * a relative specifier is forced to start with `./` unless already absolute —
 * a bare specifier reads as a package name and resolves to nothing, silently,
 * under `skipLibCheck`.
 *
 * Every route Nitro knows is keyed, not only branded ones — what makes the
 * lookup total and lets `MatchedRoutes` be reused verbatim. It costs nothing:
 * an unbranded handler extracts to `never` naturally.
 */
export function emitMap(
  handlers: readonly NitroEventHandler[],
  options: EmitMapOptions
): string {
  const { nitroOptions } = options

  // Nitro's `typesDir`. Nuxt hands Nitro its own `buildDir`, so the emitted
  // file lands beside `nitro-routes.d.ts` and the relative handler paths in
  // the two files are byte-identical — no import-path rewriting anywhere.
  const typesDir = resolve(nitroOptions.buildDir, 'types')

  // A `Map` rather than an object literal: route keys come from the
  // filesystem, and `__proto__` is a legal directory name.
  const routes = new Map<string, Map<string, string[]>>()

  for (const handler of handlers) {
    // Nitro's own guard. `handler` is typed `string` but Nitro's dev handlers
    // carry a function, and a route-less entry is middleware.
    if (typeof handler.handler !== 'string' || !handler.route) continue

    // `||`, not `??`, because Nitro writes `mw.method || "default"` and this
    // loop is that loop.
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
 * The map a build writes **before Nitro exists** — `nuxi dev` can render the
 * template before `nitro:init` fires. The same file shell as a populated map
 * (`renderFile` applied to no routes), so the two cannot drift.
 */
export const EMPTY_MAP: string = renderFile([])

/**
 * The file the emitter writes. The `import type` lines stay even with no
 * routes — an unused type import costs nothing, and one shell is what makes
 * {@link EMPTY_MAP} provably the same file.
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
    // Makes this a module, which makes the block above an *augmentation* of
    // `TypedApiErrors` rather than a fresh global one. Nitro does exactly this.
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
 * One handler's contribution to a route+method entry. `Serialize`/`Simplify`
 * wrap the extractor here because serialization is a property of the wire —
 * and `Serialize` carries a second load: `ExtractErrorsSafe` answers
 * `unknown` for a handler with an index signature, and `Serialize<unknown>`
 * is `never`, which closes that door for everything the map can reach.
 * `Flatten` is deliberately absent: indexing out of the map evaluates on its
 * own.
 */
function declaredUnionFor(specifier: string): string {
  return `Simplify<Serialize<ExtractErrorsSafe<typeof import(${quote(specifier)}).default>>>`
}

/**
 * The handler's module specifier, relative to the map's directory.
 * `resolveNitroPath` is Nitro's own resolver; `relative` is pathe's, so
 * separators are POSIX (a backslash in a specifier is an escape sequence);
 * the extension is stripped and `./` forced. The one path `relative` cannot
 * relativise — another Windows drive — comes back absolute and is emitted
 * as-is, which TypeScript does resolve; `./D:/…` would not.
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
 * A map's entries in key order. Codepoint order rather than `localeCompare`:
 * the output must be identical on every machine that builds the app, and a
 * locale-aware collation is not.
 */
function sortedEntries<V>(map: ReadonlyMap<string, V>): [string, V][] {
  return [...map].toSorted(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )
}
