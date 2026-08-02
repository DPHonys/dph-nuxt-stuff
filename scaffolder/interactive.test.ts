import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createInteractiveAdapter,
  type InteractionPrompts,
  type TextPromptOptions,
} from './internal/interaction'
import { renderScaffoldOutcome } from './internal/outcome'
import type { OutcomeReporter } from './internal/outcome'
import {
  createProductionFormatter,
  createProductionInstaller,
} from './internal/production'
import { createTemplateRegistry } from './internal/registry'
import { createScaffolder } from './internal/scaffolder'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('interactive happy path', () => {
  it('uses the approved prompts, inline name diagnostics, review, and defaults', async () => {
    const repositoryRoot = await createTemporaryRoot()
    await mkdir(join(repositoryRoot, 'packages/existing'), { recursive: true })
    const events: unknown[] = []
    const nameInputs = [
      '',
      'a'.repeat(81),
      'Not-Canonical',
      'existing',
      'api-2-client',
    ]
    const prompts = createScriptedPrompts({
      events,
      nameInputs,
      description: '  A typed API client  ',
      confirmed: true,
    })

    const result = await createInteractiveAdapter(prompts).request({
      repositoryRoot,
      templates: [{ id: 'nuxt-module', label: 'Nuxt module' }],
    })

    expect(result).toEqual({
      status: 'confirmed',
      request: {
        templateKind: 'nuxt-module',
        scaffoldName: 'api-2-client',
        description: 'A typed API client',
      },
    })
    expect(events).toEqual([
      { type: 'intro', message: 'Scaffold a workspace package' },
      {
        type: 'select',
        message: 'Template kind',
        options: [{ value: 'nuxt-module', label: 'Nuxt module' }],
        initialValue: 'nuxt-module',
      },
      {
        type: 'text',
        message: 'Scaffold name',
        hasDefault: false,
      },
      { type: 'validation', message: 'Enter a scaffold name.' },
      { type: 'validation', message: 'Use 80 characters or fewer.' },
      {
        type: 'validation',
        message:
          'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
      },
      {
        type: 'validation',
        message:
          'packages/existing already exists. Choose a different scaffold name.',
      },
      {
        type: 'text',
        message: 'Description (optional)',
        hasDefault: true,
        defaultValue: '',
      },
      {
        type: 'note',
        title: 'Review',
        message:
          'Template kind   Nuxt module\n' +
          'Directory       packages/api-2-client\n' +
          'Package         @dphonys/api-2-client\n' +
          'Nuxt module     api-2-client\n' +
          'Config key      api2Client\n' +
          'Display name    Api 2 Client\n' +
          'Description     A typed API client',
      },
      {
        type: 'confirm',
        message: 'Create this package?',
        initialValue: false,
      },
    ])
  })

  it('represents blank descriptions as absent and default-No as a decline', async () => {
    const repositoryRoot = await createTemporaryRoot()
    const events: unknown[] = []
    const prompts = createScriptedPrompts({
      events,
      nameInputs: ['image-tools'],
      description: '   ',
      confirmed: false,
    })

    const result = await createInteractiveAdapter(prompts).request({
      repositoryRoot,
      templates: [{ id: 'nuxt-module', label: 'Nuxt module' }],
    })

    expect(result).toEqual({ status: 'declined' })
    expect(events).toContainEqual({
      type: 'note',
      title: 'Review',
      message:
        'Template kind   Nuxt module\n' +
        'Directory       packages/image-tools\n' +
        'Package         @dphonys/image-tools\n' +
        'Nuxt module     image-tools\n' +
        'Config key      imageTools\n' +
        'Display name    Image Tools\n' +
        'Description     (none)',
    })
  })

  it('does not touch the filesystem or effects when interaction is declined', async () => {
    const repositoryRoot = await createTemporaryRoot()
    await writeFile(join(repositoryRoot, 'unchanged'), 'marker', 'utf8')
    const before = await readdir(repositoryRoot)
    const effect = vi.fn()
    const scaffold = createScaffolder({
      registry: createTemplateRegistry([]),
      interaction: {
        async request() {
          return { status: 'declined' }
        },
        progress: effect,
      },
      installer: { install: effect },
      formatter: { format: effect },
      now: () => new Date('2042-01-01T00:00:00.000Z'),
      nonce: () => 'unused',
    })

    await expect(scaffold.run({ repositoryRoot })).resolves.toEqual({
      status: 'declined',
      exitCode: 0,
    })
    expect(await readdir(repositoryRoot)).toEqual(before)
    await expect(
      readFile(join(repositoryRoot, 'unchanged'), 'utf8')
    ).resolves.toBe('marker')
    expect(effect).not.toHaveBeenCalled()
  })

  it('renders exact successful and cancelled handoff copy', () => {
    const messages: Array<{ kind: string; message: string }> = []
    const reporter: OutcomeReporter = {
      success: (message) => messages.push({ kind: 'success', message }),
      cancel: (message) => messages.push({ kind: 'cancel', message }),
      error: (message) => messages.push({ kind: 'error', message }),
    }

    renderScaffoldOutcome(
      {
        status: 'created',
        exitCode: 0,
        packageName: '@dphonys/image-tools',
        destination: 'packages/image-tools',
      },
      reporter
    )
    renderScaffoldOutcome({ status: 'cancelled', exitCode: 0 }, reporter)

    expect(messages).toEqual([
      {
        kind: 'success',
        message:
          'Created @dphonys/image-tools at packages/image-tools.\n\n' +
          'Next steps from the repository root:\n' +
          '  pnpm --filter @dphonys/image-tools dev\n' +
          '  pnpm --filter @dphonys/image-tools test\n\n' +
          'Full verification was not run.',
      },
      {
        kind: 'cancel',
        message: 'Scaffolding cancelled. No files were changed.',
      },
    ])
  })
})

describe('production post-commit adapters', () => {
  it('detects pnpm at the explicit root and installs there with inherited output', async () => {
    const packageManager = { name: 'pnpm' as const, command: 'pnpm' }
    const detect = vi.fn(async () => packageManager)
    const install = vi.fn(async () => ({}))
    const installer = createProductionInstaller({ detect, install })

    await installer.install({
      repositoryRoot: '/repository',
      destination: 'packages/image-tools',
    })

    expect(detect).toHaveBeenCalledWith('/repository', {
      includeParentDirs: false,
      ignoreArgv: true,
    })
    expect(install).toHaveBeenCalledWith({
      cwd: '/repository',
      packageManager,
      silent: false,
    })
  })

  it('refuses to install with a package manager other than pnpm', async () => {
    const installer = createProductionInstaller({
      detect: async () => ({ name: 'npm', command: 'npm' }),
      install: vi.fn(async () => ({})),
    })

    await expect(
      installer.install({
        repositoryRoot: '/repository',
        destination: 'packages/image-tools',
      })
    ).rejects.toThrow('Expected pnpm at the repository root, detected npm.')
  })

  it('formats only the generated destination from the repository root', async () => {
    const run = vi.fn(async () => {})
    const formatter = createProductionFormatter(run)
    const controller = new AbortController()

    await formatter.format({
      repositoryRoot: '/repository',
      destination: 'packages/image-tools',
      signal: controller.signal,
    })

    expect(run).toHaveBeenCalledWith(
      'pnpm',
      ['exec', 'oxfmt', 'packages/image-tools'],
      { cwd: '/repository', signal: controller.signal }
    )
  })
})

function createScriptedPrompts(options: {
  events: unknown[]
  nameInputs: string[]
  description: string
  confirmed: boolean
}): InteractionPrompts {
  const cancelSymbol = Symbol('cancel')

  return {
    intro(message) {
      options.events.push({ type: 'intro', message })
    },
    async select(prompt) {
      options.events.push({
        type: 'select',
        message: prompt.message,
        options: prompt.options,
        initialValue: prompt.initialValue,
      })
      return prompt.initialValue
    },
    async text(prompt) {
      options.events.push({
        type: 'text',
        message: prompt.message,
        hasDefault: 'defaultValue' in prompt,
        ...('defaultValue' in prompt
          ? { defaultValue: prompt.defaultValue }
          : {}),
      })

      if (prompt.message === 'Description (optional)') {
        return options.description
      }
      return submitValidInput(prompt, options.nameInputs, options.events)
    },
    note(message, title) {
      options.events.push({ type: 'note', title, message })
    },
    async confirm(prompt) {
      options.events.push({
        type: 'confirm',
        message: prompt.message,
        initialValue: prompt.initialValue,
      })
      return options.confirmed
    },
    progress(event) {
      options.events.push({ type: 'progress', ...event })
    },
    isCancel(value): value is symbol {
      return value === cancelSymbol
    },
  }
}

function submitValidInput(
  prompt: TextPromptOptions,
  inputs: string[],
  events: unknown[]
): string {
  for (const input of inputs) {
    const message = prompt.validate?.(input)
    if (!message) return input
    events.push({ type: 'validation', message })
  }
  throw new Error('Scripted prompt ran out of valid inputs.')
}

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'scaffolder-interactive-'))
  temporaryRoots.push(root)
  return root
}
