import type { PackageJson } from 'pkg-types'
import { createTemplateRegistry } from './registry'
import type {
  TemplateDefinition,
  TemplatePreparation,
  TemplatePreparationContext,
  TemplateRegistry,
} from './types'

const requiredFiles = [
  'LICENSE',
  'README.md',
  'package.json',
  'tsconfig.json',
  'src/module.ts',
  'src/runtime/plugin.ts',
  'playground/app.vue',
  'playground/nuxt.config.ts',
  'playground/package.json',
  'playground/tsconfig.json',
  'test/basic.test.ts',
  'test/fixtures/basic/app.vue',
  'test/fixtures/basic/nuxt.config.ts',
  'test/fixtures/basic/package.json',
] as const

const allowedTextTokens = [
  'SCAFFOLD_CONFIG_KEY_TOKEN',
  'SCAFFOLD_DEFAULT_MESSAGE_TOKEN',
  'SCAFFOLD_DESCRIPTION_TOKEN',
  'SCAFFOLD_DISPLAY_NAME_TOKEN',
  'SCAFFOLD_FIXTURE_MESSAGE_TOKEN',
  'SCAFFOLD_PACKAGE_NAME_TOKEN',
  'SCAFFOLD_RUNTIME_INJECTION_TOKEN',
  'SCAFFOLD_YEAR_TOKEN',
] as const

export const nuxtModuleTemplate: TemplateDefinition = Object.freeze({
  id: 'nuxt-module',
  label: 'Nuxt module',
  scaffoldNameInitialValue: 'nuxt-',
  sourceDirectory: 'scaffolder/templates/nuxt-module',
  requiredFiles,
  allowedTextTokens,
  prepare: prepareNuxtModule,
})

export function createProductionTemplateRegistry(): TemplateRegistry {
  return createTemplateRegistry([nuxtModuleTemplate])
}

function prepareNuxtModule(
  context: TemplatePreparationContext
): TemplatePreparation {
  const { naming } = context
  const fixtureMessage = `Configured by the ${naming.displayName} test fixture`
  const description = context.description ? `${context.description}\n\n` : ''
  const descriptionUpdates = context.description
    ? { description: context.description }
    : {}
  const manifestUpdates: PackageJson = {
    name: naming.packageName,
    version: '0.0.1',
    type: 'module',
    license: 'MIT',
    engines: { node: '>=26.0.0' },
    keywords: ['nuxt', 'nuxt-module', naming.scaffoldName],
    repository: {
      type: 'git',
      url: 'https://github.com/DPHonys/dph-nuxt-stuff.git',
      directory: naming.destination,
    },
    ...descriptionUpdates,
  }

  return {
    operations: [
      {
        kind: 'replace-text' as const,
        file: 'LICENSE',
        replacements: { SCAFFOLD_YEAR_TOKEN: String(context.year) },
      },
      {
        kind: 'replace-text' as const,
        file: 'README.md',
        replacements: {
          SCAFFOLD_CONFIG_KEY_TOKEN: naming.configKey,
          SCAFFOLD_DESCRIPTION_TOKEN: description,
          SCAFFOLD_DISPLAY_NAME_TOKEN: naming.displayName,
          SCAFFOLD_PACKAGE_NAME_TOKEN: naming.packageName,
          SCAFFOLD_RUNTIME_INJECTION_TOKEN: naming.runtimeInjection,
        },
      },
      {
        kind: 'write-package-json' as const,
        file: 'package.json',
        updates: manifestUpdates,
      },
      {
        kind: 'replace-text' as const,
        file: 'src/module.ts',
        replacements: {
          SCAFFOLD_CONFIG_KEY_TOKEN: naming.configKey,
          SCAFFOLD_DEFAULT_MESSAGE_TOKEN: naming.defaultMessage,
        },
      },
      {
        kind: 'mutate-typescript' as const,
        file: 'src/module.ts',
        recipe: {
          name: 'set-nuxt-module-identities' as const,
          moduleName: naming.moduleName,
          configKey: naming.configKey,
        },
      },
      {
        kind: 'replace-text' as const,
        file: 'src/runtime/plugin.ts',
        replacements: { SCAFFOLD_CONFIG_KEY_TOKEN: naming.configKey },
      },
      {
        kind: 'replace-text' as const,
        file: 'playground/app.vue',
        replacements: {
          SCAFFOLD_DISPLAY_NAME_TOKEN: naming.displayName,
          SCAFFOLD_RUNTIME_INJECTION_TOKEN: naming.runtimeInjection,
        },
      },
      {
        kind: 'replace-text' as const,
        file: 'playground/nuxt.config.ts',
        replacements: { SCAFFOLD_PACKAGE_NAME_TOKEN: naming.packageName },
      },
      {
        kind: 'write-package-json' as const,
        file: 'playground/package.json',
        updates: {
          name: naming.playgroundPackageName,
          dependencies: {
            [naming.packageName]: 'workspace:*',
            nuxt: 'catalog:',
          },
        },
      },
      {
        kind: 'replace-text' as const,
        file: 'test/basic.test.ts',
        replacements: { SCAFFOLD_FIXTURE_MESSAGE_TOKEN: fixtureMessage },
      },
      {
        kind: 'replace-text' as const,
        file: 'test/fixtures/basic/app.vue',
        replacements: {
          SCAFFOLD_RUNTIME_INJECTION_TOKEN: naming.runtimeInjection,
        },
      },
      {
        kind: 'replace-text' as const,
        file: 'test/fixtures/basic/nuxt.config.ts',
        replacements: {
          SCAFFOLD_CONFIG_KEY_TOKEN: naming.configKey,
          SCAFFOLD_FIXTURE_MESSAGE_TOKEN: fixtureMessage,
        },
      },
      {
        kind: 'write-package-json' as const,
        file: 'test/fixtures/basic/package.json',
        updates: { name: naming.fixturePackageName },
      },
    ],
    validations: [
      {
        kind: 'package-json-fields' as const,
        file: 'package.json',
        expected: manifestUpdates,
      },
      {
        kind: 'text-contains' as const,
        file: 'src/module.ts',
        values: [
          naming.moduleName,
          naming.configKey,
          naming.defaultMessage,
          '>=4.0.0',
        ],
      },
      {
        kind: 'text-contains' as const,
        file: 'src/runtime/plugin.ts',
        values: [naming.configKey],
      },
      {
        kind: 'text-contains' as const,
        file: 'README.md',
        values: [
          naming.displayName,
          naming.packageName,
          naming.configKey,
          naming.runtimeInjection,
        ],
      },
    ],
  }
}
