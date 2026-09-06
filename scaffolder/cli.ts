import { defineCommand, runMain } from 'citty'
import process from 'node:process'
import { runScaffolder, type RunScaffolderOptions } from './index'
import { resolveScaffoldCliRequest } from './internal/non-interactive'
import { renderScaffoldOutcome } from './internal/outcome'

const scaffoldCommand = defineCommand({
  meta: {
    name: 'scaffold',
    description: 'Scaffold a repository-owned workspace package',
  },
  args: {
    template: {
      type: 'string',
      description:
        'Template kind for non-interactive scaffolding (for example, nuxt-module)',
    },
    name: {
      type: 'string',
      description:
        'Scaffold name for non-interactive scaffolding (for example, nuxt-image-tools)',
    },
    description: {
      type: 'string',
      description: 'Package description for non-interactive scaffolding',
    },
  },
  async run({ args }) {
    const resolution = resolveScaffoldCliRequest(args)
    if (resolution.mode === 'usage-error') {
      console.error(resolution.message)
      process.exitCode = 1
      return
    }

    const controller = new AbortController()
    const interrupt = (): void => {
      controller.abort(new Error('Scaffolding interrupted.'))
    }
    process.once('SIGINT', interrupt)

    const scaffolderOptions: RunScaffolderOptions = {
      repositoryRoot: process.cwd(),
      signal: controller.signal,
    }
    if (resolution.mode === 'non-interactive') {
      scaffolderOptions.request = resolution.request
    }

    try {
      const outcome = await runScaffolder(scaffolderOptions)
      renderScaffoldOutcome(outcome)
      process.exitCode = outcome.exitCode
    } finally {
      process.removeListener('SIGINT', interrupt)
    }
  },
})

await runMain(scaffoldCommand)
