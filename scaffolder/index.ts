import { createProductionScaffolder } from './internal/production'
import type { ScaffoldOutcome, ScaffoldRequest } from './internal/types'

export type { ScaffoldOutcome, ScaffoldRequest } from './internal/types'

export interface RunScaffolderOptions {
  repositoryRoot: string
  signal?: AbortSignal
  /**
   * When present, scaffolds without prompting — for scripts and agents. The
   * request is validated up front and every failure exits non-zero instead of
   * falling back to a prompt.
   */
  request?: ScaffoldRequest
}

/**
 * Runs the repository-owned Scaffolder without taking ownership of process
 * termination. The executable shell is responsible for translating the
 * returned outcome into `process.exitCode`.
 */
export async function runScaffolder(
  options: RunScaffolderOptions
): Promise<ScaffoldOutcome> {
  const { request, ...runOptions } = options
  return createProductionScaffolder(request ? { request } : {}).run(runOptions)
}
