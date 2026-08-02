import { camelCase, titleCase } from 'scule'
import type { ScaffoldNaming } from './types'

const SCAFFOLD_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function createNaming(scaffoldName: string): ScaffoldNaming {
  if (scaffoldName.length > 80 || !SCAFFOLD_NAME_PATTERN.test(scaffoldName)) {
    throw new Error(`Invalid scaffold name: ${scaffoldName}`)
  }

  const configKey = camelCase(scaffoldName, { normalize: true })
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
