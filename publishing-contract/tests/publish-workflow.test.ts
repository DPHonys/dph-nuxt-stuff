import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const workflowPath = join(repositoryRoot, '.github', 'workflows', 'publish.yml')

interface WorkflowStep {
  name?: string
  uses?: string
  if?: string
  run?: string
  with?: Record<string, unknown>
  env?: Record<string, unknown>
}

interface WorkflowJob {
  environment?: unknown
  permissions?: Record<string, unknown>
  'runs-on'?: string
  steps: WorkflowStep[]
}

interface PublishWorkflow {
  on: Record<string, unknown>
  concurrency: {
    group: string
    'cancel-in-progress': boolean
  }
  permissions: Record<string, unknown>
  jobs: Record<string, WorkflowJob>
}

describe('trusted publication workflow', () => {
  it('is manual-only, main-only, serialized, and least-privileged', async () => {
    const workflow = await readWorkflow()
    const publishJob = workflow.jobs.publish

    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
    expect(workflow.concurrency).toEqual({
      group: 'publish-packages',
      'cancel-in-progress': false,
    })
    expect(workflow.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    })
    expect(Object.keys(workflow.jobs)).toEqual(['publish'])
    expect(publishJob?.['runs-on']).toBe('ubuntu-latest')
    expect(publishJob?.environment).toBeUndefined()
    expect(publishJob?.permissions).toBeUndefined()

    const guard = publishJob?.steps[0]
    expect(guard?.if).toBe("github.ref != 'refs/heads/main'")
    expect(guard?.run).toContain('exit 1')
  })

  it('prepares the pinned toolchain and passes the gate before publishing', async () => {
    const workflow = await readWorkflow()
    const rootManifest = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8')
    ) as { packageManager: string }
    const steps = workflow.jobs.publish?.steps ?? []
    const checkoutIndex = stepIndex(steps, (step) =>
      step.uses?.startsWith('actions/checkout@')
    )
    const pnpmIndex = stepIndex(steps, (step) =>
      step.uses?.startsWith('pnpm/action-setup@')
    )
    const nodeIndex = stepIndex(steps, (step) =>
      step.uses?.startsWith('actions/setup-node@')
    )
    const installIndex = stepIndex(
      steps,
      (step) => step.run === 'pnpm install --frozen-lockfile'
    )
    const checkIndex = stepIndex(steps, (step) => step.run === 'pnpm check')
    const publishIndex = stepIndex(
      steps,
      (step) =>
        step.run ===
        'pnpm publish -r --access public --provenance --no-git-checks'
    )

    expect([
      checkoutIndex,
      pnpmIndex,
      nodeIndex,
      installIndex,
      checkIndex,
      publishIndex,
    ]).toEqual([1, 2, 3, 4, 5, 6])
    expect(rootManifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
    expect(steps[pnpmIndex]?.uses).toBe('pnpm/action-setup@v4')
    expect(steps[pnpmIndex]?.with).toBeUndefined()
    expect(steps[nodeIndex]?.with).toMatchObject({
      'node-version': 26,
      'registry-url': 'https://registry.npmjs.org',
    })
    expect(steps[publishIndex]?.env).toBeUndefined()
  })

  it('contains no legacy or additional publication capabilities', async () => {
    const workflowSource = await readFile(workflowPath, 'utf8')
    const rootManifest = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8')
    ) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(workflowSource).not.toMatch(
      /NPM_TOKEN|NODE_AUTH_TOKEN|GITHUB_TOKEN|secrets\./
    )
    expect(workflowSource).not.toMatch(
      /\benvironment:|contents:\s*write|pnpm version|changelogen|gh release|git (?:tag|push)/
    )
    expect(workflowSource).not.toMatch(
      /^\s+(?:push|pull_request|schedule|workflow_call):/m
    )
    expect(rootManifest.scripts.release).toBeUndefined()
    expect(rootManifest.devDependencies.changelogen).toBeUndefined()
    await expect(
      access(join(repositoryRoot, '.github', 'workflows', 'release.yml'))
    ).rejects.toThrow()
  })
})

async function readWorkflow(): Promise<PublishWorkflow> {
  return parse(await readFile(workflowPath, 'utf8')) as PublishWorkflow
}

function stepIndex(
  steps: WorkflowStep[],
  predicate: (step: WorkflowStep) => boolean | undefined
): number {
  return steps.findIndex((step) => predicate(step) === true)
}
