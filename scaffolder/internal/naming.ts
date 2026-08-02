import { camelCase, titleCase } from 'scule'
import type { ScaffoldNaming } from './types'

const SCAFFOLD_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const CONVENTIONAL_NUXT_PREFIX = /^nuxt-(?=[a-z])/

export function validateScaffoldName(scaffoldName: string): string | undefined {
  if (scaffoldName.length === 0 || scaffoldName.trim().length === 0) {
    return 'Enter a scaffold name.'
  }
  if (scaffoldName.length > 80) {
    return 'Use 80 characters or fewer.'
  }
  if (!SCAFFOLD_NAME_PATTERN.test(scaffoldName)) {
    return 'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).'
  }
}

export function createNaming(scaffoldName: string): ScaffoldNaming {
  const validationMessage = validateScaffoldName(scaffoldName)
  if (validationMessage) {
    throw new Error(validationMessage)
  }

  const consumerName = scaffoldName.replace(CONVENTIONAL_NUXT_PREFIX, '')
  const configKey = camelCase(consumerName, { normalize: true })
  const displayName = titleCase(scaffoldName, { normalize: true })

  return Object.freeze({
    scaffoldName,
    destination: `packages/${scaffoldName}`,
    packageName: `@dphonys/${scaffoldName}`,
    moduleName: scaffoldName,
    configKey,
    runtimeInjection: `$${configKey}`,
    displayName,
    defaultMessage: `Hello from ${displayName}`,
    playgroundPackageName: `@dphonys/${scaffoldName}-playground`,
    fixturePackageName: `@dphonys/${scaffoldName}-test-fixture`,
  })
}
