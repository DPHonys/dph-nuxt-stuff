/**
 * The route discovery seam: the only code in the module that reads Nitro's
 * handler list or hooks Nitro. On Nuxt 5 the routes come from Nuxt's own
 * `server:routes` hook, and only the body of `addRouteTypeTemplate` changes;
 * the renderer it calls never sees Nitro.
 */

import { addTypeTemplate, updateTemplates } from '@nuxt/kit'
import type { Nuxt, NuxtHooks } from '@nuxt/schema'
import type { EventHandler } from 'h3'
import { isAbsolute, relative, resolve } from 'pathe'
import { isRecordLike, isString } from '../runtime/shared/guards'
import { stringLiteral } from './emit-map'
import type { RouteHandler } from './emit-map'

/** Nitro's own instance, as Nuxt hands it over. */
type Nitro = Parameters<NuxtHooks['nitro:init']>[0]

// Under `types/`, Nitro's `typesDir`, because every handler specifier in the
// file is relative to it - and an `import('…')` that resolves to nothing in a
// `.d.ts` produces no diagnostic at all.
const TEMPLATE_FILENAME = 'types/better-handler.d.ts'

const DEFAULT_METHOD = 'default'

// Nitro's own extension list, verbatim - kept identical or the stripped
// specifier disagrees with the one Nitro writes into `nitro-routes.d.ts`.
const SOURCE_EXTENSION = /\.(?:js|mjs|cjs|ts|mts|cts|tsx|jsx)$/

const RELATIVE_SPECIFIER = /^\.\.?\//

// Nitro's own path template, `{{ buildDir }}` and the like, verbatim.
const PATH_TEMPLATE = /\{\{ ?([\w.]+) ?\}\}/g

/** The slice of Nitro's options the path arithmetic reads. */
export type NitroPathOptions = Pick<
  Nitro['options'],
  'alias' | 'buildDir' | 'srcDir'
>

/**
 * A handler entry as Nitro lists it, the slice read here. `method` is a plain
 * string: the filesystem scanner writes `''` for a file naming none, and a
 * module's `addServerHandler` may pass `'POST'` through.
 */
export interface HandlerEntry {
  readonly route?: string
  readonly method?: string
  /** A path for a scanned handler; a dev handler carries the function itself. */
  readonly handler: string | EventHandler
}

/** A handler entry with a path to emit a type for. */
interface ScannedHandlerEntry extends HandlerEntry {
  readonly route: string
  readonly handler: string
}

// Nitro's own guard: a dev handler carries a function rather than a path,
// and a route-less entry is middleware.
function isScanned(entry: HandlerEntry): entry is ScannedHandlerEntry {
  return isString(entry.handler) && Boolean(entry.route)
}

/**
 * The routes Nitro serves, as the renderer reads them: Nitro's own route-types
 * loop re-run, with method keys lowercased and every specifier relative to the
 * map's directory and starting with `./` or `../`.
 */
export function routeHandlersOf(
  entries: readonly HandlerEntry[],
  nitroOptions: NitroPathOptions
): RouteHandler[] {
  // The map lands beside Nitro's own `nitro-routes.d.ts`.
  const typesDir = resolve(nitroOptions.buildDir, 'types')

  return entries.filter(isScanned).map((entry) => ({
    route: entry.route,
    // `||`, not `??`, because Nitro writes `mw.method || "default"`.
    method: (entry.method || DEFAULT_METHOD).toLowerCase(),
    handlerType: `typeof import(${stringLiteral(
      specifierFor(entry.handler, typesDir, nitroOptions)
    )}).default`,
  }))
}

// The option a `{{ a.b }}` template names, read off Nitro's options by key.
function optionAt(options: NitroPathOptions, path: string): string | undefined {
  let value: unknown = options

  for (const key of path.split('.')) {
    value = isRecordLike(value)
      ? Object.entries(value).find(([own]) => own === key)?.[1]
      : undefined
  }

  return isString(value) && value !== '' ? value : undefined
}

// Nitro's `resolveNitroPath` (`nitropack/kit`), restated so the module needs
// no `nitropack` of its own: `{{ }}` templates expanded from the options, an
// alias prefix replaced, the result resolved against `srcDir`. A scanned
// handler's path is already absolute and passes through untouched.
function resolveHandlerPath(
  handlerPath: string,
  nitroOptions: NitroPathOptions
): string {
  let path = handlerPath.replaceAll(
    PATH_TEMPLATE,
    (_, key: string) => optionAt(nitroOptions, key) ?? key
  )

  for (const [alias, target] of Object.entries(nitroOptions.alias)) {
    if (path.startsWith(alias)) path = target + path.slice(alias.length)
  }

  return resolve(nitroOptions.srcDir, path)
}

// `relative` is pathe's, so separators are POSIX. The one path it cannot
// relativise - another Windows drive - comes back absolute and is emitted
// as-is, which TypeScript does resolve; `./D:/…` would not.
function specifierFor(
  handlerPath: string,
  typesDir: string,
  nitroOptions: NitroPathOptions
): string {
  const specifier = relative(
    typesDir,
    resolveHandlerPath(handlerPath, nitroOptions)
  ).replace(SOURCE_EXTENSION, '')

  return RELATIVE_SPECIFIER.test(specifier) || isAbsolute(specifier)
    ? specifier
    : `./${specifier}`
}

/**
 * Register the generated type template and keep it current: rendered from
 * every route Nitro serves, and again each time Nitro rewrites its own route
 * types. Before Nitro exists the template renders no routes, so a cold start
 * gets the same file shell it later replaces.
 */
export function addRouteTypeTemplate(
  nuxt: Nuxt,
  render: (routes: readonly RouteHandler[]) => string
): void {
  // Captured here and read by `getContents`: on a dev-server restart the
  // current instance and the hooked one are not the same object.
  let nitro: Nitro | undefined

  // The context names all three programs: passing a context at all opts out
  // of everything it does not name.
  addTypeTemplate(
    {
      filename: TEMPLATE_FILENAME,
      getContents: () =>
        render(
          nitro === undefined
            ? []
            : routeHandlersOf(
                [...nitro.scannedHandlers, ...nitro.options.handlers],
                // Passed whole: a `{{ }}` path template may name any option.
                nitro.options
              )
        ),
    },
    { nitro: true, nuxt: true, shared: true }
  )

  nuxt.hook('nitro:init', (instance) => {
    nitro = instance

    // `types:extend` fires inside Nitro's `writeTypes` after a fresh handler
    // scan, so this map lands with Nitro's own route types.
    instance.hooks.hook('types:extend', async () => {
      await updateTemplates({
        filter: (template) => template.filename === TEMPLATE_FILENAME,
      })
    })
  })
}
