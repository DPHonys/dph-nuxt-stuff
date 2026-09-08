import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { run, runSucceeding } from '../src/run.ts'

const node = process.execPath
const trapsSigtermAndExitsCleanly =
  'process.on("SIGTERM", () => process.exit(0)); setTimeout(() => {}, 10_000)'

describe('run', () => {
  it('hands back a non-zero exit with both streams', async () => {
    const result = await run(node, [
      '-e',
      'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)',
    ])
    expect(result).toEqual({ exitCode: 3, stdout: 'out', stderr: 'err' })
  })

  it('rejects an elapsed timeout even when the child handles SIGTERM and exits 0', async () => {
    await expect(
      run(node, ['-e', trapsSigtermAndExitsCleanly], { timeout: 100 })
    ).rejects.toThrow('timed out after 100 ms')
  })

  it('reports a signal termination that is not a timeout', async () => {
    await expect(
      run(node, ['-e', 'process.kill(process.pid, "SIGKILL")'])
    ).rejects.toThrow('was terminated by SIGKILL')
  })
})

describe('runSucceeding', () => {
  it('reports a non-zero exit with the command and its output', async () => {
    await expect(
      runSucceeding(node, ['-e', 'console.error("boom"); process.exit(2)'])
    ).rejects.toThrow(/exited with 2\nboom/)
  })

  it('reports a timeout instead of the clean exit that follows it', async () => {
    await expect(
      runSucceeding(node, ['-e', trapsSigtermAndExitsCleanly], {
        timeout: 100,
      })
    ).rejects.toThrow('timed out after 100 ms')
  })
})
