import { resolveTypePaths } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import type { NitroConfig } from 'nitropack/types'
import { fileURLToPath } from 'node:url'

/**
 * The parents' `/types` specifiers, which the generated map reaches for: the
 * errors map *augments* the first, the request-inputs map *imports* from the
 * second. Neither resolves from an app that installed the umbrella alone.
 */
const PARENT_TYPES_SPECIFIERS = [
  '@dphonys/nuxt-handler-errors/types',
  '@dphonys/nuxt-handler-validation/types',
] as const

/** The slice of a tsconfig object the entry is written on. */
interface PathsCarrier {
  compilerOptions?: { paths?: Record<string, string[]> }
}

/**
 * Map both parent `/types` specifiers on every generated tsconfig - app,
 * node, shared and Nitro - to the declaration each resolves to *from the
 * umbrella's own location*, so pnpm's nested layout is honoured.
 *
 * `typescript.hoist` cannot do this: it resolves from the app's `modulesDir`
 * alone and silently drops what it cannot find there. Each entry joins the
 * `paths` map Nuxt and Nitro wrote; only its own specifier's entry, if some
 * other layer already claimed one, is replaced.
 *
 * @param nuxt - The instance whose generated tsconfigs carry the entries.
 * @param from - This module's own URL (`import.meta.url`).
 */
export function addParentTypesPaths(nuxt: Nuxt, from: string): void {
  // The *directory* this module was loaded from. `resolveTypePaths` searches
  // paths, not module URLs: handed a `file://` URL it resolves from the
  // process's working directory instead - an app root, where an
  // umbrella-only install has no parent to find.
  const searchPath = fileURLToPath(new URL('.', from))

  // Resolved once, lazily, failure included: `prepare:types` and
  // `nitro:config` both need it, and the parents are exact-pinned
  // dependencies, so one answer holds for the whole build.
  //
  // `resolveTypePaths` rather than `resolvePath`: it answers with the
  // declaration TypeScript loads for a subpath export, which is what a
  // `paths` entry has to name. Its answers are extensionless, as Nuxt's own
  // entries are - TypeScript retries `.d.ts` itself.
  let declarations: Promise<Record<string, string[]>> | undefined

  const resolveDeclarations = (): Promise<Record<string, string[]>> => {
    declarations ??= resolveTypePaths(
      [...PARENT_TYPES_SPECIFIERS],
      [searchPath]
    ).then((resolved) => {
      const missing = PARENT_TYPES_SPECIFIERS.filter(
        (specifier) => !resolved.some(([found]) => found === specifier)
      )

      if (missing.length > 0) {
        throw new Error(
          `[nuxt-typed-handler] could not resolve ${missing.join(', ')} from ${searchPath}. Both parents are exact-pinned dependencies of this package; reinstall it.`
        )
      }

      return Object.fromEntries(
        resolved.map(([specifier, path]) => [specifier, [path]])
      )
    })

    return declarations
  }

  const write = async (...targets: PathsCarrier[]): Promise<void> => {
    const entries = await resolveDeclarations()

    for (const target of targets) {
      target.compilerOptions ??= {}
      target.compilerOptions.paths ??= {}

      for (const [specifier, paths] of Object.entries(entries)) {
        target.compilerOptions.paths[specifier] = paths
      }
    }
  }

  nuxt.hook('prepare:types', ({ tsConfig, nodeTsConfig, sharedTsConfig }) =>
    write(tsConfig, nodeTsConfig, sharedTsConfig)
  )

  nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
    nitroConfig.typescript ??= {}
    nitroConfig.typescript.tsConfig ??= {}

    return write(nitroConfig.typescript.tsConfig)
  })
}
