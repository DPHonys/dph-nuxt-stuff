import { cancel, log, outro } from '@clack/prompts'
import type { ScaffoldOutcome } from './types'

export interface OutcomeReporter {
  success: (message: string) => void
  cancel: (message: string) => void
  error: (message: string) => void
}

const clackOutcomeReporter: OutcomeReporter = {
  success: outro,
  cancel,
  error(message) {
    log.error(message)
  },
}

export function renderScaffoldOutcome(
  outcome: ScaffoldOutcome,
  reporter: OutcomeReporter = clackOutcomeReporter
): void {
  switch (outcome.status) {
    case 'created':
      reporter.success(
        `Created ${outcome.packageName} at ${outcome.destination}.\n\n` +
          `Next steps from the repository root:\n` +
          `  pnpm --filter ${outcome.packageName} dev\n` +
          `  pnpm --filter ${outcome.packageName} test\n\n` +
          'Full verification was not run.'
      )
      return
    case 'cancelled':
    case 'declined':
      reporter.cancel('Scaffolding cancelled. No files were changed.')
      return
    case 'collision':
      reporter.error(
        `${outcome.destination} already exists. No files were changed.`
      )
      return
    case 'generation-failed':
    case 'interrupted-before-commit':
      reporter.error(outcome.error.message)
      return
    case 'cleanup-failed':
      reporter.error(
        `${outcome.error.message}\nCleanup also failed: ${outcome.cleanupError.message}\nRetained artifact: ${outcome.retainedArtifact}`
      )
      return
    case 'install-failed':
    case 'format-failed':
    case 'interrupted-after-commit':
      reporter.error(outcome.error.message)
  }
}
