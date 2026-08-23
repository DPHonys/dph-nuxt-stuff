import { resolveTypePaths } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import type { NitroConfig } from 'nitropack/types'
import { fileURLToPath } from 'node:url'

// The generated map augments the first and imports from the second; neither
// resolves from an app that installed the umbrella alone.
const PARENT_TYPES_SPECIFIERS = [
  '@dphonys/nuxt-handler-errors/types',
  '@dphonys/nuxt-handler-validation/types',
] as const

interface PathsCarrier {
  compilerOptions?: { paths?: Record<string, string[]> }
}

/**
 * Map both parent `/types` specifiers, on every generated tsconfig, to the
 * declaration each resolves to from this module's own location (`from` is
 * its `import.meta.url`), so pnpm's nested layout is honoured.
 * `typescript.hoist` cannot do this: it resolves from the app's `modulesDir`
 * alone and silently drops what it cannot find there.
 */
export function addParentTypesPaths(nuxt: Nuxt, from: string): void {
  // A directory, not the URL: handed a `file://` URL, `resolveTypePaths`
  // silently searches from the process's working directory instead.
  const searchPath = fileURLToPath(new URL('.', from))

  // Resolved once for both hooks, failure included. `resolveTypePaths` rather
  // than `resolvePath`: a `paths` entry has to name the declaration
  // TypeScript loads for a subpath export, not the runtime file.
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
