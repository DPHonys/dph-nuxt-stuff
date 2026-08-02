import {
  cp,
  mkdir,
  mkdtemp,
  lstat,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createNaming } from './internal/naming'
import {
  createTemplateRegistry,
  prepareTemplate,
  TemplatePlanError,
} from './internal/registry'
import { renderPreparedTemplate } from './internal/render'
import { createScaffolder } from './internal/scaffolder'
import type {
  InteractionAdapter,
  OwnedScaffoldArtifact,
  PostCommitContext,
  ScaffoldProgressEvent,
  ScaffoldTransactionOperations,
  TemplateDefinition,
  TemplatePreparation,
} from './internal/types'

const fixtureRoot = resolve(import.meta.dirname, 'test/fixtures/test-template')
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('scaffolder preparation', () => {
  it('derives and freezes every identity from one Scaffold name', () => {
    const naming = createNaming('api-2-client')

    expect(naming).toEqual({
      scaffoldName: 'api-2-client',
      destination: 'packages/api-2-client',
      packageName: '@dphonys/api-2-client',
      moduleName: 'api-2-client',
      configKey: 'api2Client',
      runtimeInjection: '$api2Client',
      displayName: 'Api 2 Client',
      defaultMessage: 'Hello from Api 2 Client',
      playgroundPackageName: '@dphonys/api-2-client-playground',
      fixturePackageName: '@dphonys/api-2-client-test-fixture',
    })
    expect(Object.isFrozen(naming)).toBe(true)
  })

  it('returns a recursively immutable declarative plan', () => {
    const plan = prepareTemplate(createTestTemplate(), {
      scaffoldName: 'image-tools',
      description: 'Image tools',
      year: 2042,
    })

    expect(plan.template).toEqual({ id: 'test-module', label: 'Test module' })
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.naming)).toBe(true)
    expect(Object.isFrozen(plan.operations)).toBe(true)
    expect(Object.isFrozen(plan.operations[0])).toBe(true)
    expect(plan.validations.map(({ kind }) => kind)).toEqual([
      'required-files',
      'no-unresolved-tokens',
      'package-json-fields',
      'text-contains',
    ])
  })

  it('rejects paths that escape staging and undeclared replacement tokens', () => {
    const escaping = createTestTemplate(() => ({
      operations: [
        {
          kind: 'replace-text',
          file: '../outside.md',
          replacements: { '{{DISPLAY_NAME}}': 'Outside' },
        },
      ],
    }))
    const undeclared = createTestTemplate(() => ({
      operations: [
        {
          kind: 'replace-text',
          file: 'README.md',
          replacements: { '{{UNKNOWN}}': 'unsafe' },
        },
      ],
    }))

    expect(() =>
      prepareTemplate(escaping, { scaffoldName: 'safe-name', year: 2042 })
    ).toThrow(TemplatePlanError)
    expect(() =>
      prepareTemplate(undeclared, { scaffoldName: 'safe-name', year: 2042 })
    ).toThrow('Text replacement uses undeclared token: {{UNKNOWN}}')
  })

  it('indexes a static registry and rejects duplicate Template kinds', () => {
    const definition = createTestTemplate()
    const registry = createTemplateRegistry([definition])

    expect(registry.list()).toEqual([
      { id: 'test-module', label: 'Test module' },
    ])
    expect(registry.get('test-module')).toBe(definition)
    expect(registry.get('missing')).toBeUndefined()
    expect(() => createTemplateRegistry([definition, definition])).toThrow(
      'Duplicate Template kind: test-module'
    )
  })
})

describe('scaffolder transaction seam', () => {
  it('renders, validates, atomically commits, installs, then formats', async () => {
    const repositoryRoot = await createRepository()
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const progress: ScaffoldProgressEvent[] = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), progress)

    const outcome = await scaffold.run({ repositoryRoot })

    expect(outcome).toEqual({
      status: 'created',
      exitCode: 0,
      packageName: '@dphonys/api-2-client',
      destination: 'packages/api-2-client',
    })
    expect(calls).toEqual([
      {
        effect: 'install',
        context: {
          repositoryRoot,
          destination: 'packages/api-2-client',
        },
      },
      {
        effect: 'format',
        context: {
          repositoryRoot,
          destination: 'packages/api-2-client',
        },
      },
    ])
    expect(progress).toEqual([
      { phase: 'render', message: 'Rendering and validating package' },
      {
        phase: 'install',
        message: 'Installing workspace dependencies with pnpm',
      },
      {
        phase: 'format',
        message: 'Formatting packages/api-2-client',
      },
    ])

    const destination = join(repositoryRoot, 'packages/api-2-client')
    await expect(stat(destination)).resolves.toMatchObject({})
    await expect(
      readFile(join(destination, 'README.md'), 'utf8')
    ).resolves.toBe('# Api 2 Client\n\nPackage: `@dphonys/api-2-client`\n')
    await expect(readFile(join(destination, 'LICENSE'), 'utf8')).resolves.toBe(
      'Copyright (c) 2042\n'
    )
    const manifest = JSON.parse(
      await readFile(join(destination, 'package.json'), 'utf8')
    )
    expect(manifest).toMatchObject({
      name: '@dphonys/api-2-client',
      version: '0.0.1',
      description: 'A consumer-safe test package',
      private: false,
    })
    const moduleSource = await readFile(
      join(destination, 'src/module.ts'),
      'utf8'
    )
    expect(moduleSource).toMatch(/name: ["']api-2-client["']/)
    expect(moduleSource).toMatch(/configKey: ["']api2Client["']/)

    await expect(
      stat(join(repositoryRoot, 'packages/.scaffold-api-2-client.lock'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(repositoryRoot, 'packages/.scaffold-api-2-client-fixed'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('fails safely on an unexpected TypeScript shape before commit', async () => {
    const repositoryRoot = await createRepository()
    await writeFile(
      join(repositoryRoot, 'templates/test-template/src/module.ts'),
      'export default { meta: {} }\n',
      'utf8'
    )
    const calls: Array<{ effect: string; context: PostCommitContext }> = []

    const outcome = await createTestScaffolder(calls).run({ repositoryRoot })

    expect(outcome.status).toBe('generation-failed')
    if (outcome.status === 'generation-failed') {
      expect(outcome.error.message).toContain(
        'Unexpected TypeScript structure in src/module.ts'
      )
    }
    expect(calls).toEqual([])
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(repositoryRoot, 'packages/.scaffold-api-2-client-fixed'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unresolved known tokens while the package is still staged', async () => {
    const repositoryRoot = await createRepository()
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const definition = createTestTemplate((context) => {
      const prepared = defaultPreparation(context)
      return {
        ...prepared,
        operations: prepared.operations.filter(
          (operation) =>
            operation.kind !== 'replace-text' || operation.file !== 'LICENSE'
        ),
      }
    })

    const outcome = await createTestScaffolder(calls, definition).run({
      repositoryRoot,
    })

    expect(outcome.status).toBe('generation-failed')
    if (outcome.status === 'generation-failed') {
      expect(outcome.error.message).toBe(
        'Unresolved Template token {{YEAR}} in LICENSE'
      )
    }
    expect(calls).toEqual([])
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['directory', 'file', 'symlink'] as const)(
    'preserves an existing destination represented by a %s',
    async (kind) => {
      const repositoryRoot = await createRepository()
      const destination = join(repositoryRoot, 'packages/api-2-client')
      const unrelated = join(repositoryRoot, 'unrelated')
      await mkdir(unrelated)
      await writeFile(join(unrelated, 'marker'), 'untouched', 'utf8')

      if (kind === 'directory') {
        await mkdir(destination)
        await writeFile(join(destination, 'marker'), 'untouched', 'utf8')
      } else if (kind === 'file') {
        await writeFile(destination, 'untouched', 'utf8')
      } else {
        await symlink(unrelated, destination)
      }

      const calls: Array<{ effect: string; context: PostCommitContext }> = []
      const outcome = await createTestScaffolder(calls).run({ repositoryRoot })

      expect(outcome).toEqual({
        status: 'collision',
        exitCode: 1,
        destination: 'packages/api-2-client',
        reason: 'destination-exists',
      })
      expect(calls).toEqual([])
      if (kind === 'directory') {
        await expect(
          readFile(join(destination, 'marker'), 'utf8')
        ).resolves.toBe('untouched')
      } else if (kind === 'file') {
        await expect(readFile(destination, 'utf8')).resolves.toBe('untouched')
      } else {
        expect((await lstat(destination)).isSymbolicLink()).toBe(true)
        await expect(
          readFile(join(destination, 'marker'), 'utf8')
        ).resolves.toBe('untouched')
      }
    }
  )

  it('preserves a destination that appears after review', async () => {
    const repositoryRoot = await createRepository()
    const destination = join(repositoryRoot, 'packages/api-2-client')
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), [], {
      async request() {
        await writeFile(destination, 'appeared after review', 'utf8')
        return confirmedRequest()
      },
    })

    await expect(scaffold.run({ repositoryRoot })).resolves.toEqual({
      status: 'collision',
      exitCode: 1,
      destination: 'packages/api-2-client',
      reason: 'destination-exists',
    })
    await expect(readFile(destination, 'utf8')).resolves.toBe(
      'appeared after review'
    )
    expect(calls).toEqual([])
  })

  it('preserves a destination that appears immediately before commit', async () => {
    const repositoryRoot = await createRepository()
    const destination = join(repositoryRoot, 'packages/api-2-client')
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), [], {
      transaction: {
        async render(options) {
          await renderPreparedTemplate(options)
          await writeFile(destination, 'appeared before commit', 'utf8')
        },
      },
    })

    await expect(scaffold.run({ repositoryRoot })).resolves.toEqual({
      status: 'collision',
      exitCode: 1,
      destination: 'packages/api-2-client',
      reason: 'destination-exists',
    })
    await expect(readFile(destination, 'utf8')).resolves.toBe(
      'appeared before commit'
    )
    await expect(
      stat(join(repositoryRoot, 'packages/.scaffold-api-2-client-fixed'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(calls).toEqual([])
  })

  it('uses the cooperative lock to reject a second same-name invocation', async () => {
    const repositoryRoot = await createRepository()
    const lock = join(repositoryRoot, 'packages/.scaffold-api-2-client.lock')
    await writeFile(lock, 'first invocation', 'utf8')
    const calls: Array<{ effect: string; context: PostCommitContext }> = []

    await expect(
      createTestScaffolder(calls).run({ repositoryRoot })
    ).resolves.toEqual({
      status: 'collision',
      exitCode: 1,
      destination: 'packages/api-2-client',
      reason: 'lock-held',
    })
    await expect(readFile(lock, 'utf8')).resolves.toBe('first invocation')
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(calls).toEqual([])
  })

  it.each([
    {
      phase: 'copy',
      arrange: async (_root: string, definition: TemplateDefinition) => ({
        ...definition,
        sourceDirectory: 'templates/missing-template',
      }),
    },
    {
      phase: 'token',
      arrange: async (root: string, definition: TemplateDefinition) => {
        await rm(join(root, 'templates/test-template/README.md'))
        await mkdir(join(root, 'templates/test-template/README.md'))
        return definition
      },
    },
    {
      phase: 'JSON',
      arrange: async (root: string, definition: TemplateDefinition) => {
        await rm(join(root, 'templates/test-template/package.json'))
        await mkdir(join(root, 'templates/test-template/package.json'))
        return definition
      },
    },
  ])('cleans owned artifacts after a $phase failure', async ({ arrange }) => {
    const repositoryRoot = await createRepository()
    const unrelated = join(repositoryRoot, 'packages/unrelated')
    await writeFile(unrelated, 'untouched', 'utf8')
    const definition = await arrange(repositoryRoot, createTestTemplate())
    const calls: Array<{ effect: string; context: PostCommitContext }> = []

    const outcome = await createTestScaffolder(calls, definition).run({
      repositoryRoot,
    })

    expect(outcome.status).toBe('generation-failed')
    await expect(readFile(unrelated, 'utf8')).resolves.toBe('untouched')
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(repositoryRoot, 'packages/.scaffold-api-2-client-fixed'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(repositoryRoot, 'packages/.scaffold-api-2-client.lock'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(calls).toEqual([])
  })

  it('reports the exact owned artifact when cleanup fails', async () => {
    const repositoryRoot = await createRepository()
    const removed: OwnedScaffoldArtifact[] = []
    const staging = join(
      repositoryRoot,
      'packages/.scaffold-api-2-client-fixed'
    )
    const lock = join(repositoryRoot, 'packages/.scaffold-api-2-client.lock')
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const definition = createTestTemplate(() => ({
      operations: [
        {
          kind: 'replace-text',
          file: 'missing.md',
          replacements: { '{{DISPLAY_NAME}}': 'never rendered' },
        },
      ],
    }))
    const scaffold = createTestScaffolder(calls, definition, [], {
      transaction: {
        async removeOwnedArtifact(artifact) {
          removed.push(artifact)
          if (artifact.kind === 'staging') {
            throw new Error('simulated staging cleanup refusal')
          }
          await rm(artifact.path, { force: true })
        },
      },
    })

    const outcome = await scaffold.run({ repositoryRoot })

    expect(outcome).toMatchObject({
      status: 'cleanup-failed',
      exitCode: 1,
      retainedArtifact: staging,
      cleanupError: { message: 'simulated staging cleanup refusal' },
    })
    expect(removed).toEqual([
      { kind: 'staging', path: staging },
      { kind: 'lock', path: lock },
    ])
    await expect(stat(staging)).resolves.toMatchObject({})
    await expect(stat(lock)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(calls).toEqual([])
  })

  it('retains the package and lock when lock release fails after commit', async () => {
    const repositoryRoot = await createRepository()
    const lock = join(repositoryRoot, 'packages/.scaffold-api-2-client.lock')
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), [], {
      transaction: {
        async removeOwnedArtifact(artifact) {
          if (artifact.kind === 'lock') throw new Error('lock is busy')
          await rm(artifact.path, { recursive: true, force: true })
        },
      },
    })

    const outcome = await scaffold.run({ repositoryRoot })

    expect(outcome).toMatchObject({
      status: 'lock-release-failed',
      exitCode: 1,
      error: { message: 'lock is busy' },
      packageName: '@dphonys/api-2-client',
      destination: 'packages/api-2-client',
      retainedArtifact: lock,
    })
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).resolves.toMatchObject({})
    await expect(stat(lock)).resolves.toMatchObject({})
    expect(calls).toEqual([])
  })

  it('retains the package and suppresses formatting when installation fails', async () => {
    const repositoryRoot = await createRepository()
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), [], {
      async install(context) {
        calls.push({ effect: 'install', context: { ...context } })
        throw new Error('pnpm install failed')
      },
    })

    const outcome = await scaffold.run({ repositoryRoot })

    expect(outcome).toMatchObject({
      status: 'install-failed',
      exitCode: 1,
      error: { message: 'pnpm install failed' },
    })
    expect(calls.map(({ effect }) => effect)).toEqual(['install'])
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).resolves.toMatchObject({})
  })

  it('retains the installed package when formatting fails', async () => {
    const repositoryRoot = await createRepository()
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), [], {
      async format(context) {
        calls.push({ effect: 'format', context: { ...context } })
        throw new Error('oxfmt failed')
      },
    })

    const outcome = await scaffold.run({ repositoryRoot })

    expect(outcome).toMatchObject({
      status: 'format-failed',
      exitCode: 1,
      error: { message: 'oxfmt failed' },
    })
    expect(calls.map(({ effect }) => effect)).toEqual(['install', 'format'])
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).resolves.toMatchObject({})
  })

  it('cleans owned artifacts when interrupted before commit', async () => {
    const repositoryRoot = await createRepository()
    const controller = new AbortController()
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), [], {
      transaction: {
        async render(options) {
          await renderPreparedTemplate(options)
          controller.abort(new Error('interrupted during rendering'))
        },
      },
    })

    const outcome = await scaffold.run({
      repositoryRoot,
      signal: controller.signal,
    })

    expect(outcome).toMatchObject({
      status: 'interrupted-before-commit',
      exitCode: 130,
    })
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(repositoryRoot, 'packages/.scaffold-api-2-client-fixed'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(repositoryRoot, 'packages/.scaffold-api-2-client.lock'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(calls).toEqual([])
  })

  it('retains the package when interrupted after commit', async () => {
    const repositoryRoot = await createRepository()
    const controller = new AbortController()
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), [], {
      async install(context) {
        calls.push({ effect: 'install', context: { ...context } })
        controller.abort(new Error('interrupted during installation'))
      },
    })

    const outcome = await scaffold.run({
      repositoryRoot,
      signal: controller.signal,
    })

    expect(outcome).toMatchObject({
      status: 'interrupted-after-commit',
      exitCode: 130,
    })
    expect(calls.map(({ effect }) => effect)).toEqual(['install'])
    await expect(
      stat(join(repositoryRoot, 'packages/api-2-client'))
    ).resolves.toMatchObject({})
  })

  it('treats an interruption before confirmation as prompt cancellation', async () => {
    const repositoryRoot = await createRepository()
    const controller = new AbortController()
    const calls: Array<{ effect: string; context: PostCommitContext }> = []
    const scaffold = createTestScaffolder(calls, createTestTemplate(), [], {
      async request() {
        controller.abort(new Error('prompt cancelled'))
        throw controller.signal.reason
      },
    })

    await expect(
      scaffold.run({ repositoryRoot, signal: controller.signal })
    ).resolves.toEqual({ status: 'cancelled', exitCode: 0 })
    expect(calls).toEqual([])
  })
})

interface TestScaffolderOptions {
  request?: InteractionAdapter['request']
  install?: (context: PostCommitContext) => Promise<void>
  format?: (context: PostCommitContext) => Promise<void>
  transaction?: Partial<ScaffoldTransactionOperations>
}

function createTestScaffolder(
  calls: Array<{ effect: string; context: PostCommitContext }>,
  definition = createTestTemplate(),
  progress: ScaffoldProgressEvent[] = [],
  options: TestScaffolderOptions = {}
) {
  return createScaffolder({
    registry: createTemplateRegistry([definition]),
    interaction: {
      request: options.request ?? (async () => confirmedRequest()),
      progress(event) {
        progress.push(event)
      },
    },
    installer: {
      install:
        options.install ??
        (async (context) => {
          calls.push({ effect: 'install', context: { ...context } })
        }),
    },
    formatter: {
      format:
        options.format ??
        (async (context) => {
          calls.push({ effect: 'format', context: { ...context } })
        }),
    },
    now: () => new Date('2042-06-15T00:00:00.000Z'),
    nonce: () => 'fixed',
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })
}

function confirmedRequest() {
  return {
    status: 'confirmed' as const,
    request: {
      templateKind: 'test-module',
      scaffoldName: 'api-2-client',
      description: '  A consumer-safe test package  ',
    },
  }
}

function createTestTemplate(prepare = defaultPreparation): TemplateDefinition {
  return {
    id: 'test-module',
    label: 'Test module',
    sourceDirectory: 'templates/test-template',
    requiredFiles: ['README.md', 'LICENSE', 'package.json', 'src/module.ts'],
    allowedTextTokens: ['{{DISPLAY_NAME}}', '{{PACKAGE_NAME}}', '{{YEAR}}'],
    prepare,
  }
}

function defaultPreparation(
  context: Parameters<TemplateDefinition['prepare']>[0]
): TemplatePreparation {
  const descriptionUpdates = context.description
    ? { description: context.description }
    : {}

  return {
    operations: [
      {
        kind: 'replace-text',
        file: 'README.md',
        replacements: {
          '{{DISPLAY_NAME}}': context.naming.displayName,
          '{{PACKAGE_NAME}}': context.naming.packageName,
        },
      },
      {
        kind: 'replace-text',
        file: 'LICENSE',
        replacements: { '{{YEAR}}': String(context.year) },
      },
      {
        kind: 'write-package-json',
        file: 'package.json',
        updates: {
          name: context.naming.packageName,
          version: '0.0.1',
          private: false,
          ...descriptionUpdates,
        },
      },
      {
        kind: 'mutate-typescript',
        file: 'src/module.ts',
        recipe: {
          name: 'set-nuxt-module-identities',
          moduleName: context.naming.moduleName,
          configKey: context.naming.configKey,
        },
      },
    ],
    validations: [
      {
        kind: 'package-json-fields',
        file: 'package.json',
        expected: {
          name: context.naming.packageName,
          version: '0.0.1',
          private: false,
          ...descriptionUpdates,
        },
      },
      {
        kind: 'text-contains',
        file: 'src/module.ts',
        values: [context.naming.moduleName, context.naming.configKey],
      },
    ],
  }
}

async function createRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'scaffolder-ticket-08-'))
  temporaryRoots.push(repositoryRoot)
  await mkdir(join(repositoryRoot, 'packages'))
  await mkdir(join(repositoryRoot, 'templates'))
  await cp(fixtureRoot, join(repositoryRoot, 'templates/test-template'), {
    recursive: true,
  })
  return repositoryRoot
}
