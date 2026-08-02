import { createProductionScaffolder } from './internal/production'
import type { ScaffoldOutcome } from './internal/types'

export type { ScaffoldOutcome } from './internal/types'

export interface RunScaffolderOptions {
  repositoryRoot: string
  signal?: AbortSignal
}

/**
 * Runs the repository-owned Scaffolder without taking ownership of process
 * termination. The executable shell is responsible for translating the
 * returned outcome into `process.exitCode`.
 */
export async function runScaffolder(
  options: RunScaffolderOptions
): Promise<ScaffoldOutcome> {
  return createProductionScaffolder().run(options)
}
