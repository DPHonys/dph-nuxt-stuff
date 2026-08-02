import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import { prepareTemplate, resolveWithin } from './registry'
import { renderPreparedTemplate } from './render'
import type {
  PostCommitContext,
  ScaffoldDependencies,
  ScaffoldOutcome,
  Scaffolder,
} from './types'

class DestinationCollisionError extends Error {
  override name = 'DestinationCollisionError'
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

      try {
        throwIfAborted(options.signal)
        const interactionOptions = options.signal
          ? {
              repositoryRoot,
              signal: options.signal,
              templates: dependencies.registry.list(),
            }
          : { repositoryRoot, templates: dependencies.registry.list() }
        const interaction =
          await dependencies.interaction.request(interactionOptions)

        if (interaction.status === 'declined') {
          return { status: 'declined', exitCode: 0 }
        }
        if (interaction.status === 'cancelled') {
          return { status: 'cancelled', exitCode: 0 }
        }

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
          return { status: 'collision', exitCode: 1, destination }
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
              `Another Scaffolder owns ${destination}`
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
        await renderPreparedTemplate({
          repositoryRoot,
          stagingRoot: stagingPath,
          plan,
        })

        throwIfAborted(options.signal)
        phase = 'commit'
        if (await pathExists(destinationPath)) {
          throw new DestinationCollisionError(
            `Destination appeared before commit: ${destination}`
          )
        }
        await rename(stagingPath, destinationPath)
        stagingOwned = false
        committed = true

        phase = 'release-lock'
        await rm(lockPath)
        lockOwned = false

        throwIfAborted(options.signal)
        const postCommitContext: PostCommitContext = options.signal
          ? {
              repositoryRoot,
              destination,
              signal: options.signal,
            }
          : { repositoryRoot, destination }

        phase = 'install'
        await dependencies.installer.install(postCommitContext)
        throwIfAborted(options.signal)

        phase = 'format'
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
            return { status: 'collision', exitCode: 1, destination }
          }
          if (options.signal?.aborted) {
            return {
              status: 'interrupted-before-commit',
              exitCode: 130,
              error,
            }
          }
          return { status: 'generation-failed', exitCode: 1, error }
        }

        if (lockOwned) {
          try {
            await rm(lockPath)
            lockOwned = false
          } catch {
            // A post-commit outcome must retain the Generated package. Ticket
            // 11 adds the richer retained-lock recovery report.
          }
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
  lockOwned: boolean
  lockPath: string
  stagingOwned: boolean
  stagingPath: string
}): Promise<{ error: Error; artifact: string } | undefined> {
  let failure: { error: Error; artifact: string } | undefined

  if (options.stagingOwned) {
    try {
      await rm(options.stagingPath, { recursive: true, force: true })
    } catch (error) {
      failure = { error: asError(error), artifact: options.stagingPath }
    }
  }
  if (options.lockOwned) {
    try {
      await rm(options.lockPath, { force: true })
    } catch (error) {
      failure ??= { error: asError(error), artifact: options.lockPath }
    }
  }

  return failure
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

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST'
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isNodeError(
  error: unknown
): error is Error & { code: string | undefined } {
  return error instanceof Error && 'code' in error
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
