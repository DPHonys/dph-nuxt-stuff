import { defineCommand, runMain } from 'citty'
import process from 'node:process'
import { runScaffolder } from './index'
import { renderScaffoldOutcome } from './internal/outcome'

const scaffoldCommand = defineCommand({
  meta: {
    name: 'scaffold',
    description: 'Scaffold a repository-owned workspace package',
  },
  async run() {
    const controller = new AbortController()
    const interrupt = (): void => {
      controller.abort(new Error('Scaffolding interrupted.'))
    }
    process.once('SIGINT', interrupt)

    try {
      const outcome = await runScaffolder({
        repositoryRoot: process.cwd(),
        signal: controller.signal,
      })
      renderScaffoldOutcome(outcome)
      process.exitCode = outcome.exitCode
    } finally {
      process.removeListener('SIGINT', interrupt)
    }
  },
})

await runMain(scaffoldCommand)
