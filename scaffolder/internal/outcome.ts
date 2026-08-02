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
        outcome.reason === 'lock-held'
          ? `Another Scaffolder is already creating ${outcome.destination}. No files were changed.`
          : `${outcome.destination} already exists. No files were changed.`
      )
      return
    case 'generation-failed':
      reporter.error(
        `Could not create the package: ${outcome.error.message}\nNo files were changed.`
      )
      return
    case 'interrupted-before-commit':
      reporter.error('Scaffolding interrupted. No files were changed.')
      return
    case 'cleanup-failed':
      reporter.error(
        `Could not create the package: ${outcome.error.message}\n` +
          `Cleanup also failed: ${outcome.cleanupError.message}\n` +
          `The Scaffolder retained an owned artifact at ${outcome.retainedArtifact}.\n` +
          'Inspect and remove that exact artifact manually before retrying.'
      )
      return
    case 'lock-release-failed':
      reporter.error(
        `Created ${outcome.packageName} at ${outcome.destination}, but releasing its Scaffolder lock failed: ${outcome.error.message}\n` +
          `The generated package was retained. Inspect and remove the lock at ${outcome.retainedArtifact} manually.\n\n` +
          `Resume from the repository root:\n` +
          `  pnpm install\n` +
          `  pnpm exec oxfmt ${outcome.destination}`
      )
      return
    case 'install-failed':
      reporter.error(
        `Created ${outcome.packageName} at ${outcome.destination}, but installing workspace dependencies failed: ${outcome.error.message}\n` +
          `The generated package was retained.\n\n` +
          `Resume from the repository root:\n` +
          `  pnpm install\n` +
          `  pnpm exec oxfmt ${outcome.destination}`
      )
      return
    case 'format-failed':
      reporter.error(
        `Created ${outcome.packageName} at ${outcome.destination} and installed workspace dependencies, but formatting failed: ${outcome.error.message}\n` +
          `The generated package was retained.\n\n` +
          `Resume from the repository root:\n` +
          `  pnpm exec oxfmt ${outcome.destination}\n` +
          `  pnpm --filter ${outcome.packageName} test`
      )
      return
    case 'interrupted-after-commit':
      reporter.error(
        `Scaffolding was interrupted after ${outcome.packageName} was created at ${outcome.destination}.\n` +
          `The generated package was retained.\n\n` +
          `Resume from the repository root:\n` +
          `  pnpm install\n` +
          `  pnpm exec oxfmt ${outcome.destination}`
      )
  }
}
