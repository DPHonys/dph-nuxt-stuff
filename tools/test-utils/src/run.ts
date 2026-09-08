import { spawn } from 'node:child_process'
import process from 'node:process'

export interface RunOptions {
  cwd?: string
  /** Laid over the inherited environment. */
  env?: NodeJS.ProcessEnv
  timeout?: number
}

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Run a command to completion and hand back how it exited, whatever that was;
 * only a spawn failure or a signal termination rejects, and a `timeout` that
 * elapses is reported as such rather than as the SIGTERM it sends. For the
 * suites whose subject is a non-zero exit.
 */
export function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {}
): Promise<RunResult> {
  const startedAt = Date.now()
  return new Promise((settle, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (exitCode, signal) => {
      if (exitCode === null) {
        reject(
          new Error(
            `${command} ${describeSignal(signal, options.timeout, Date.now() - startedAt)}`
          )
        )
        return
      }
      settle({ exitCode, stdout, stderr })
    })
  })
}

/** `run`, where any exit but zero is the failure, reported with both streams. */
export async function runSucceeding(
  command: string,
  args: readonly string[],
  options: RunOptions = {}
): Promise<RunResult> {
  const result = await run(command, args, options)
  if (result.exitCode !== 0) {
    throw new Error(
      [
        `${command} ${args.join(' ')} exited with ${result.exitCode}`,
        result.stdout,
        result.stderr,
      ]
        .filter((part) => part.trim())
        .join('\n')
    )
  }
  return result
}

function describeSignal(
  signal: NodeJS.Signals | null,
  timeout: number | undefined,
  elapsedMs: number
): string {
  if (signal === 'SIGTERM' && timeout !== undefined && elapsedMs >= timeout) {
    return `timed out after ${timeout} ms`
  }
  return `was terminated by ${signal ?? 'an unknown signal'}`
}
