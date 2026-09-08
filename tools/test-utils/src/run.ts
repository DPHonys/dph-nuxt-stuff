import { spawn } from 'node:child_process'
import process from 'node:process'

export interface RunOptions {
  cwd?: string
  /** Laid over the inherited environment. */
  env?: NodeJS.ProcessEnv
  /**
   * Milliseconds after which the child is sent SIGTERM and the run rejects as
   * timed out, whatever the child then exits with.
   */
  timeout?: number
}

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Run a command to completion and hand back how it exited, whatever that was;
 * only a spawn failure, a signal termination, or an elapsed `timeout` rejects.
 * For the suites whose subject is a non-zero exit.
 */
export function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {}
): Promise<RunResult> {
  return new Promise((settle, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let timedOut = false
    const timer =
      options.timeout === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
          }, options.timeout)
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`${command} timed out after ${options.timeout} ms`))
        return
      }
      if (exitCode === null) {
        reject(new Error(`${command} was terminated by ${signal}`))
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
