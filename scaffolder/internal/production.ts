import { spawn } from 'node:child_process'
import { detectPackageManager, installDependencies } from 'nypm'
import { createClackInteraction } from './interaction'
import { createClackNonInteractiveInteraction } from './non-interactive'
import { createProductionTemplateRegistry } from './nuxt-module'
import { createScaffolder, productionNonce } from './scaffolder'
import type {
  FormatterAdapter,
  InstallerAdapter,
  ScaffoldRequest,
  Scaffolder,
} from './types'

export interface ProductionScaffolderOptions {
  /** When present, answers the interaction from flags instead of prompts. */
  request?: ScaffoldRequest | undefined
}

export function createProductionScaffolder(
  options: ProductionScaffolderOptions = {}
): Scaffolder {
  return createScaffolder({
    registry: createProductionTemplateRegistry(),
    interaction: options.request
      ? createClackNonInteractiveInteraction(options.request)
      : createClackInteraction(),
    installer: createProductionInstaller(),
    formatter: createProductionFormatter(),
    now: () => new Date(),
    nonce: productionNonce,
  })
}

interface InstallerOperations {
  detect: typeof detectPackageManager
  install: typeof installDependencies
}

export function createProductionInstaller(
  operations: InstallerOperations = {
    detect: detectPackageManager,
    install: installDependencies,
  }
): InstallerAdapter {
  return {
    async install({ repositoryRoot }) {
      const packageManager = await operations.detect(repositoryRoot, {
        includeParentDirs: false,
        ignoreArgv: true,
      })
      if (packageManager?.name !== 'pnpm') {
        throw new Error(
          `Expected pnpm at the repository root, detected ${packageManager?.name ?? 'no package manager'}.`
        )
      }

      await operations.install({
        cwd: repositoryRoot,
        frozenLockFile: false,
        packageManager,
        silent: false,
      })
    },
  }
}

interface CommandOptions {
  cwd: string
  signal: AbortSignal | undefined
}

type RunFormatter = (
  command: string,
  arguments_: readonly string[],
  options: CommandOptions
) => Promise<void>

export function createProductionFormatter(
  runFormatter: RunFormatter = runCommand
): FormatterAdapter {
  return {
    async format(context) {
      await runFormatter('pnpm', ['exec', 'oxfmt', context.destination], {
        cwd: context.repositoryRoot,
        signal: context.signal,
      })
    },
  }
}

async function runCommand(
  command: string,
  arguments_: readonly string[],
  options: CommandOptions
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      stdio: 'inherit',
      signal: options.signal,
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          signal
            ? `Oxfmt was terminated by ${signal}.`
            : `Oxfmt exited with code ${code ?? 'unknown'}.`
        )
      )
    })
  })
}
