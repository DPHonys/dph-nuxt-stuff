import type { NuxtHooks } from '@nuxt/schema'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TypesPathsHost } from '../../src/build/parent-types-paths'
import { addParentTypesPaths } from '../../src/build/parent-types-paths'

// Which *location* the parents' declarations are resolved from. The e2e suite
// reads the entries off the generated tsconfigs; the claim here is the one
// that suite cannot make, because it runs with the package root as the
// working directory: an app installs the umbrella alone, so the answer must
// come from the umbrella's own location and from nowhere else.

const PARENT_SPECIFIERS = [
  '@dphonys/nuxt-handler-errors/types',
  '@dphonys/nuxt-handler-validation/types',
]

/** The slice of a tsconfig the entry is written on. */
interface TsConfig {
  compilerOptions?: { paths?: Record<string, string[]> }
}

/** One registration the host saw, discriminated on the hook's name. */
type HookRegistration =
  | ['prepare:types', NuxtHooks['prepare:types']]
  | ['nitro:config', NuxtHooks['nitro:config']]

/** The three carriers `prepare:types` hands over, in its own order. */
interface TsConfigs {
  tsConfig: TsConfig
  nodeTsConfig: TsConfig
  sharedTsConfig: TsConfig
}

/**
 * Just enough Nuxt to collect the two hooks and fire one. A real `loadNuxt`
 * boot would hand back the entries already relativised by Nuxt, which is the
 * e2e suite's subject, not this one's.
 */
interface FakeNuxt {
  nuxt: TypesPathsHost
  /** Fires every `prepare:types` registration over the carriers. */
  prepareTypes: (configs: TsConfigs) => Promise<void>
}

function fakeNuxt(): FakeNuxt {
  const prepareTypes: NuxtHooks['prepare:types'][] = []

  const nuxt: TypesPathsHost = {
    hook: (...registration: HookRegistration) => {
      if (registration[0] === 'prepare:types')
        prepareTypes.push(registration[1])
    },
  }

  return {
    nuxt,
    prepareTypes: async (configs) => {
      for (const callback of prepareTypes) {
        await callback({
          ...configs,
          references: [],
          declarations: [],
          nodeReferences: [],
          sharedReferences: [],
        })
      }
    },
  }
}

function tsConfigs(): TsConfigs {
  return {
    tsConfig: { compilerOptions: { paths: { '#imports': ['./imports'] } } },
    nodeTsConfig: {},
    sharedTsConfig: { compilerOptions: {} },
  }
}

describe('the parent `/types` paths entry', () => {
  it('resolves both parents from the location it is given', async () => {
    const configs = tsConfigs()
    const { nuxt, prepareTypes } = fakeNuxt()

    addParentTypesPaths(nuxt, import.meta.url)
    await prepareTypes(configs)

    for (const config of Object.values(configs)) {
      for (const specifier of PARENT_SPECIFIERS) {
        const [target] = config.compilerOptions?.paths?.[specifier] ?? []

        expect(target, `${specifier} was not mapped`).toBeTypeOf('string')
        // Extensionless, as Nuxt's own entries are: the declaration beside it
        // is what TypeScript loads.
        expect(existsSync(`${target ?? ''}.d.ts`)).toBe(true)
      }
    }

    // Added beside whatever Nuxt and Nitro wrote, never replacing the map.
    expect(configs.tsConfig.compilerOptions?.paths?.['#imports']).toEqual([
      './imports',
    ])
  })

  it('never falls back to the working directory when that location has no parents', async () => {
    // The regression this pins: a module URL handed to a resolver expecting a
    // *directory* resolves from the process's own tree instead, which is the
    // package root under test and always has both parents - so every other
    // assertion here would stay green while a consumer's app resolved
    // nothing.
    const { nuxt, prepareTypes } = fakeNuxt()

    addParentTypesPaths(
      nuxt,
      pathToFileURL(`${tmpdir()}/no-parents-here/module.mjs`).href
    )

    await expect(prepareTypes(tsConfigs())).rejects.toThrow(/could not resolve/)
  })
})
