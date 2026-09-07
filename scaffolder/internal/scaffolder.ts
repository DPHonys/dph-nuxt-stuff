import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import { asError, isAlreadyExists, isNotFound } from './errors'
import { prepareTemplate, resolveWithin } from './registry'
import { renderPreparedTemplate } from './render'
import type {
  OwnedScaffoldArtifact,
  PostCommitContext,
  ScaffoldDependencies,
  ScaffoldOutcome,
  ScaffoldTransactionOperations,
  Scaffolder,
} from './types'

class DestinationCollisionError extends Error {
  override name = 'DestinationCollisionError'

  constructor(
    message: string,
    readonly reason: 'destination-exists' | 'lock-held'
  ) {
    super(message)
  }
}

type Phase =
  | 'interaction'
  | 'prepare'
  | 'lock'
  | 'stage'
  | 'render'
  | 'commit'
  | 'release-lock'
  | 'install'
  | 'format'

/** Internal composition seam for scripted interactions and effect adapters. */
export function createScaffolder(
  dependencies: ScaffoldDependencies
): Scaffolder {
  const transaction: ScaffoldTransactionOperations = {
    render: renderPreparedTemplate,
    removeOwnedArtifact,
    ...dependencies.transaction,
  }

  return Object.freeze({
    async run(options: {
      repositoryRoot: string
      signal?: AbortSignal
    }): Promise<ScaffoldOutcome> {
      const repositoryRoot = resolve(options.repositoryRoot)
      let phase: Phase = 'interaction'
      let committed = false
      let lockOwned = false
      let stagingOwned = false
      let lockPath = ''
      let stagingPath = ''
      let destinationPath = ''
      let packageName = ''
      let destination = ''
      let confirmed = false

      try {
        throwIfAborted(options.signal)
        const interaction = await dependencies.interaction.request({
          repositoryRoot,
          signal: options.signal,
          templates: dependencies.registry.list(),
        })

        if (interaction.status === 'declined') {
          return { status: 'declined', exitCode: 0 }
        }
        if (interaction.status === 'cancelled') {
          return { status: 'cancelled', exitCode: 0 }
        }

        confirmed = true
        throwIfAborted(options.signal)
        phase = 'prepare'
        const definition = dependencies.registry.get(
          interaction.request.templateKind
        )
        if (!definition) {
          throw new Error(
            `Unknown Template kind: ${interaction.request.templateKind}`
          )
        }

        const description = interaction.request.description?.trim()
        const preparationInput = description
          ? {
              scaffoldName: interaction.request.scaffoldName,
              description,
              year: dependencies.now().getFullYear(),
            }
          : {
              scaffoldName: interaction.request.scaffoldName,
              year: dependencies.now().getFullYear(),
            }
        const plan = prepareTemplate(definition, preparationInput)
        packageName = plan.naming.packageName
        destination = plan.destination
        destinationPath = resolveWithin(repositoryRoot, destination)

        const packagesPath = resolveWithin(repositoryRoot, 'packages')
        await requireDirectory(packagesPath, 'packages')
        if (await pathExists(destinationPath)) {
          return {
            status: 'collision',
            exitCode: 1,
            destination,
            reason: 'destination-exists',
          }
        }

        throwIfAborted(options.signal)
        phase = 'lock'
        lockPath = resolveWithin(
          packagesPath,
          `.scaffold-${plan.naming.scaffoldName}.lock`
        )
        try {
          const lock = await open(lockPath, 'wx')
          lockOwned = true
          try {
            await lock.writeFile(`${process.pid}\n`, 'utf8')
          } finally {
            await lock.close()
          }
        } catch (error) {
          if (isAlreadyExists(error)) {
            throw new DestinationCollisionError(
              `Another Scaffolder owns ${destination}`,
              'lock-held'
            )
          }
          throw error
        }

        throwIfAborted(options.signal)
        phase = 'stage'
        const nonce = dependencies.nonce()
        if (!/^[\w-]+$/.test(nonce)) {
          throw new Error('Scaffolder nonce contains unsafe path characters')
        }
        stagingPath = resolveWithin(
          packagesPath,
          `.scaffold-${plan.naming.scaffoldName}-${nonce}`
        )
        await mkdir(stagingPath)
        stagingOwned = true

        throwIfAborted(options.signal)
        phase = 'render'
        dependencies.interaction.progress({
          phase: 'render',
          message: 'Rendering and validating package',
        })
        await transaction.render({
          repositoryRoot,
          stagingRoot: stagingPath,
          plan,
        })

        throwIfAborted(options.signal)
        phase = 'commit'
        if (await pathExists(destinationPath)) {
          throw new DestinationCollisionError(
            `Destination appeared before commit: ${destination}`,
            'destination-exists'
          )
        }
        // An unrelated writer that ignores the cooperative lock can still act
        // between this check and rename; portable no-clobber directory rename
        // is outside the Scaffolder's stated concurrency guarantee.
        await rename(stagingPath, destinationPath)
        stagingOwned = false
        committed = true

        phase = 'release-lock'
        await transaction.removeOwnedArtifact({ kind: 'lock', path: lockPath })
        lockOwned = false

        throwIfAborted(options.signal)
        const postCommitContext: PostCommitContext = {
          repositoryRoot,
          destination,
          signal: options.signal,
        }

        phase = 'install'
        dependencies.interaction.progress({
          phase: 'install',
          message: 'Installing workspace dependencies with pnpm',
        })
        await dependencies.installer.install(postCommitContext)
        throwIfAborted(options.signal)

        phase = 'format'
        dependencies.interaction.progress({
          phase: 'format',
          message: `Formatting ${destination}`,
        })
        await dependencies.formatter.format(postCommitContext)
        throwIfAborted(options.signal)

        return {
          status: 'created',
          exitCode: 0,
          packageName,
          destination,
        }
      } catch (caught) {
        const error = asError(caught)

        if (!committed) {
          const cleanup = await cleanupOwnedArtifacts({
            removeOwnedArtifact: transaction.removeOwnedArtifact,
            lockOwned,
            lockPath,
            stagingOwned,
            stagingPath,
          })
          if (cleanup) {
            return {
              status: 'cleanup-failed',
              exitCode: options.signal?.aborted ? 130 : 1,
              error,
              cleanupError: cleanup.error,
              retainedArtifact: cleanup.artifact,
            }
          }
          if (caught instanceof DestinationCollisionError) {
            return {
              status: 'collision',
              exitCode: 1,
              destination,
              reason: caught.reason,
            }
          }
          if (options.signal?.aborted) {
            if (!confirmed) {
              return { status: 'cancelled', exitCode: 0 }
            }
            return {
              status: 'interrupted-before-commit',
              exitCode: 130,
              error,
            }
          }
          return { status: 'generation-failed', exitCode: 1, error }
        }

        if (options.signal?.aborted) {
          return {
            status: 'interrupted-after-commit',
            exitCode: 130,
            error,
            packageName,
            destination,
          }
        }
        if (phase === 'release-lock') {
          return {
            status: 'lock-release-failed',
            exitCode: 1,
            error,
            packageName,
            destination,
            retainedArtifact: lockPath,
          }
        }
        if (phase === 'format') {
          return {
            status: 'format-failed',
            exitCode: 1,
            error,
            packageName,
            destination,
          }
        }
        return {
          status: 'install-failed',
          exitCode: 1,
          error,
          packageName,
          destination,
        }
      }
    },
  })
}

export const productionNonce = (): string => randomUUID()

async function cleanupOwnedArtifacts(options: {
  removeOwnedArtifact: (artifact: OwnedScaffoldArtifact) => Promise<void>
  lockOwned: boolean
  lockPath: string
  stagingOwned: boolean
  stagingPath: string
}): Promise<{ error: Error; artifact: string } | undefined> {
  let failure: { error: Error; artifact: string } | undefined

  if (options.stagingOwned) {
    try {
      await options.removeOwnedArtifact({
        kind: 'staging',
        path: options.stagingPath,
      })
    } catch (error) {
      failure = { error: asError(error), artifact: options.stagingPath }
    }
  }
  if (options.lockOwned) {
    try {
      await options.removeOwnedArtifact({
        kind: 'lock',
        path: options.lockPath,
      })
    } catch (error) {
      failure ??= { error: asError(error), artifact: options.lockPath }
    }
  }

  return failure
}

async function removeOwnedArtifact(
  artifact: OwnedScaffoldArtifact
): Promise<void> {
  if (artifact.kind === 'staging') {
    await rm(artifact.path, { recursive: true, force: true })
    return
  }
  await rm(artifact.path, { force: true })
}

async function requireDirectory(
  path: string,
  displayPath: string
): Promise<void> {
  const stats = await lstat(path)
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Repository path is not a directory: ${displayPath}`)
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Scaffolding interrupted')
}
