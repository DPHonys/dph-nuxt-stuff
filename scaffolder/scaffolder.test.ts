import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
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
import { createScaffolder } from './internal/scaffolder'
import type {
  PostCommitContext,
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
    const scaffold = createTestScaffolder(calls)

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
})

function createTestScaffolder(
  calls: Array<{ effect: string; context: PostCommitContext }>,
  definition = createTestTemplate()
) {
  return createScaffolder({
    registry: createTemplateRegistry([definition]),
    interaction: {
      async request() {
        return {
          status: 'confirmed',
          request: {
            templateKind: 'test-module',
            scaffoldName: 'api-2-client',
            description: '  A consumer-safe test package  ',
          },
        }
      },
    },
    installer: {
      async install(context) {
        calls.push({ effect: 'install', context: { ...context } })
      },
    },
    formatter: {
      async format(context) {
        calls.push({ effect: 'format', context: { ...context } })
      },
    },
    now: () => new Date('2042-06-15T00:00:00.000Z'),
    nonce: () => 'fixed',
  })
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
