import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createNaming, validateScaffoldName } from './internal/naming'
import {
  createProductionTemplateRegistry,
  nuxtModuleTemplate,
} from './internal/nuxt-module'
import { prepareTemplate } from './internal/registry'
import { createScaffolder } from './internal/scaffolder'

const templateRoot = resolve(import.meta.dirname, 'templates/nuxt-module')
const temporaryRoots: string[] = []

const expectedFiles = [
  'LICENSE',
  'README.md',
  'package.json',
  'playground/app.vue',
  'playground/nuxt.config.ts',
  'playground/package.json',
  'playground/tsconfig.json',
  'src/module.ts',
  'src/runtime/plugin.ts',
  'test/basic.test.ts',
  'test/fixtures/basic/app.vue',
  'test/fixtures/basic/nuxt.config.ts',
  'test/fixtures/basic/package.json',
  'tsconfig.json',
]

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('nuxt module Template contract', () => {
  it.each(['a', 'api-2-client', `a${'1'.repeat(79)}`])(
    'accepts the canonical Scaffold name %s',
    (name) => {
      expect(validateScaffoldName(name)).toBeUndefined()
      expect(createNaming(name).scaffoldName).toBe(name)
    }
  )

  it.each([
    ['', 'Enter a scaffold name.'],
    ['   ', 'Enter a scaffold name.'],
    ['a'.repeat(81), 'Use 80 characters or fewer.'],
    [
      'Api',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      'two words',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      'two_words',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      'two.words',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      'two/words',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      '@scope/name',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      'módulo',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      'two--words',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      '-leading',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      'trailing-',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
    [
      '2-client',
      'Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).',
    ],
  ])('rejects noncanonical input %#', (name, message) => {
    expect(validateScaffoldName(name)).toBe(message)
    expect(() => createNaming(name)).toThrow(message)
  })

  it('registers one production Template kind with a frozen structured plan', () => {
    const registry = createProductionTemplateRegistry()
    const plan = prepareTemplate(nuxtModuleTemplate, {
      scaffoldName: 'api-2-client',
      description: 'A typed API client',
      year: 2042,
    })

    expect(registry.list()).toEqual([
      {
        id: 'nuxt-module',
        label: 'Nuxt module',
        scaffoldNameInitialValue: 'nuxt-',
      },
    ])
    expect(registry.get('nuxt-module')).toBe(nuxtModuleTemplate)
    expect(plan.naming).toEqual({
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
    expect(plan.requiredFiles.toSorted()).toEqual(expectedFiles)
    expect(plan.allowedTextTokens).toEqual([
      'SCAFFOLD_CONFIG_KEY_TOKEN',
      'SCAFFOLD_DEFAULT_MESSAGE_TOKEN',
      'SCAFFOLD_DESCRIPTION_TOKEN',
      'SCAFFOLD_DISPLAY_NAME_TOKEN',
      'SCAFFOLD_FIXTURE_MESSAGE_TOKEN',
      'SCAFFOLD_PACKAGE_NAME_TOKEN',
      'SCAFFOLD_RUNTIME_INJECTION_TOKEN',
      'SCAFFOLD_YEAR_TOKEN',
    ])
    expect(plan.operations).toContainEqual({
      kind: 'mutate-typescript',
      file: 'src/module.ts',
      recipe: {
        name: 'set-nuxt-module-identities',
        moduleName: 'api-2-client',
        configKey: 'api2Client',
      },
    })
    expect(Object.isFrozen(plan)).toBe(true)
  })

  it('generates the exact working Package-local contract through the transaction', async () => {
    const repositoryRoot = await createRepository()
    const outcome = await createNuxtScaffolder(
      '  A typed API client for Nuxt  '
    ).run({ repositoryRoot })
    const destination = join(repositoryRoot, 'packages/api-2-client')

    expect(outcome).toEqual({
      status: 'created',
      exitCode: 0,
      packageName: '@dphonys/api-2-client',
      destination: 'packages/api-2-client',
    })
    expect(await listFiles(destination)).toEqual(expectedFiles)

    const manifest = await readJson(join(destination, 'package.json'))
    expect(manifest).toEqual({
      name: '@dphonys/api-2-client',
      version: '0.0.1',
      description: 'A typed API client for Nuxt',
      type: 'module',
      license: 'MIT',
      engines: { node: '>=26.0.0' },
      keywords: ['nuxt', 'nuxt-module', 'api-2-client'],
      repository: {
        type: 'git',
        url: 'https://github.com/DPHonys/dph-nuxt-stuff.git',
        directory: 'packages/api-2-client',
      },
      exports: {
        '.': {
          types: './dist/types.d.mts',
          import: './dist/module.mjs',
        },
      },
      main: './dist/module.mjs',
      typesVersions: { '*': { '.': ['./dist/types.d.mts'] } },
      files: ['dist'],
      publishConfig: { access: 'public' },
      scripts: {
        build: 'nuxt-module-build build',
        prepack: 'pnpm run build',
        dev: 'pnpm run dev:prepare && nuxt dev playground',
        'dev:build': 'nuxt build playground',
        'dev:prepare':
          'nuxt-module-build build --stub && nuxt-module-build prepare && nuxt prepare playground',
        lint: 'eslint .',
        pretest: 'nuxt-module-build prepare',
        typecheck:
          'pnpm run dev:prepare && vue-tsc --noEmit && vue-tsc --noEmit --project playground/tsconfig.json',
        test: 'vitest run',
        'test:watch': 'vitest watch',
        publint: 'publint',
      },
      dependencies: { '@nuxt/kit': 'catalog:' },
      devDependencies: {
        '@nuxt/devtools': 'catalog:',
        '@nuxt/module-builder': 'catalog:',
        '@nuxt/schema': 'catalog:',
        '@nuxt/test-utils': 'catalog:',
        '@types/node': 'catalog:',
        nuxt: 'catalog:',
        publint: 'catalog:',
        typescript: 'catalog:',
        vitest: 'catalog:',
        'vue-tsc': 'catalog:',
      },
    })

    await expect(
      readJson(join(destination, 'playground/package.json'))
    ).resolves.toEqual({
      name: '@dphonys/api-2-client-playground',
      type: 'module',
      private: true,
      dependencies: {
        '@dphonys/api-2-client': 'workspace:*',
        nuxt: 'catalog:',
      },
    })
    await expect(
      readJson(join(destination, 'test/fixtures/basic/package.json'))
    ).resolves.toEqual({
      name: '@dphonys/api-2-client-test-fixture',
      type: 'module',
      private: true,
    })

    const contents = await readGeneratedContents(destination)
    expect(contents.get('LICENSE')).toContain(
      'Copyright (c) 2042 Daniel Petr Honys'
    )
    expect(contents.get('src/module.ts')).toMatch(/name: ["']api-2-client["']/)
    expect(contents.get('src/module.ts')).toMatch(
      /configKey: ["']api2Client["']/
    )
    expect(contents.get('src/module.ts')).toContain(
      "compatibility: { nuxt: '>=4.0.0' }"
    )
    expect(contents.get('src/module.ts')).toContain(
      "message: 'Hello from Api 2 Client'"
    )
    expect(contents.get('src/module.ts')).toContain(
      'runtimeConfig.public.api2Client'
    )
    expect(contents.get('src/runtime/plugin.ts')).toContain(
      'api2Client: { message: starter.message }'
    )
    expect(contents.get('playground/nuxt.config.ts')).toContain(
      "modules: ['@dphonys/api-2-client']"
    )
    expect(contents.get('playground/nuxt.config.ts')).toContain(
      "compatibilityDate: 'latest'"
    )
    expect(contents.get('playground/app.vue')).toContain(
      '<h1>Api 2 Client</h1>'
    )
    expect(contents.get('playground/app.vue')).toContain(
      '{{ $api2Client.message }}'
    )
    expect(contents.get('test/fixtures/basic/nuxt.config.ts')).toContain(
      "message: 'Configured by the Api 2 Client test fixture'"
    )
    expect(contents.get('test/basic.test.ts')).toContain(
      "expect(html).toContain('<p>Configured by the Api 2 Client test fixture</p>')"
    )
    expect(contents.get('README.md')).toContain(
      '# Api 2 Client\n\nA typed API client for Nuxt'
    )
    expect(contents.get('README.md')).toContain(
      "modules: ['@dphonys/api-2-client']"
    )
    expect(contents.get('README.md')).toContain('$api2Client')
    expect([...contents.values()].join('\n').match(/TODO:/g)).toHaveLength(3)
    expect([...contents.values()].join('\n')).not.toContain('SCAFFOLD_')
  })

  it('omits a blank description instead of inventing package copy', async () => {
    const repositoryRoot = await createRepository()
    const outcome = await createNuxtScaffolder('   ').run({ repositoryRoot })
    const destination = join(repositoryRoot, 'packages/api-2-client')

    expect(outcome.status).toBe('created')
    const manifest = await readJson(join(destination, 'package.json'))
    expect(manifest).not.toHaveProperty('description')
    const readme = await readFile(join(destination, 'README.md'), 'utf8')
    expect(readme).toMatch(/^# Api 2 Client\n\n<!-- TODO:/)
    expect(readme).not.toContain('undefined')
  })

  it('uses the prefix-free consumer identities throughout a Nuxt-prefixed package', async () => {
    const repositoryRoot = await createRepository()
    const outcome = await createNuxtScaffolder(
      'Nuxt image tools',
      'nuxt-image-tools'
    ).run({ repositoryRoot })
    const destination = join(repositoryRoot, 'packages/nuxt-image-tools')

    expect(outcome).toMatchObject({
      status: 'created',
      packageName: '@dphonys/nuxt-image-tools',
      destination: 'packages/nuxt-image-tools',
    })

    const contents = await readGeneratedContents(destination)
    expect(contents.get('src/module.ts')).toMatch(
      /configKey: ["']imageTools["']/
    )
    expect(contents.get('src/module.ts')).toContain(
      'runtimeConfig.public.imageTools'
    )
    expect(contents.get('src/runtime/plugin.ts')).toContain(
      'imageTools: { message: starter.message }'
    )
    expect(contents.get('test/fixtures/basic/nuxt.config.ts')).toContain(
      'imageTools: {'
    )
    expect(contents.get('playground/app.vue')).toContain(
      '{{ $imageTools.message }}'
    )
    expect(contents.get('README.md')).toContain('$imageTools')
    expect([...contents.values()].join('\n')).not.toContain('nuxtImageTools')
  })

  it('rejects a Template that violates the Nuxt compatibility contract', async () => {
    const repositoryRoot = await createRepository()
    const moduleFile = join(
      repositoryRoot,
      'scaffolder/templates/nuxt-module/src/module.ts'
    )
    const source = await readFile(moduleFile, 'utf8')
    await writeFile(moduleFile, source.replace('>=4.0.0', '>=3.0.0'), 'utf8')

    const outcome = await createNuxtScaffolder('A typed API client').run({
      repositoryRoot,
    })

    expect(outcome.status).toBe('generation-failed')
    if (outcome.status === 'generation-failed') {
      expect(outcome.error.message).toBe(
        'src/module.ts does not contain required text: >=4.0.0'
      )
    }
    await expect(readdir(join(repositoryRoot, 'packages'))).resolves.toEqual([])
  })
})

function createNuxtScaffolder(
  description: string,
  scaffoldName = 'api-2-client'
) {
  return createScaffolder({
    registry: createProductionTemplateRegistry(),
    interaction: {
      async request() {
        return {
          status: 'confirmed',
          request: {
            templateKind: 'nuxt-module',
            scaffoldName,
            description,
          },
        }
      },
      progress() {},
    },
    installer: { async install() {} },
    formatter: { async format() {} },
    now: () => new Date('2042-06-15T00:00:00.000Z'),
    nonce: () => 'fixed',
  })
}

async function createRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'scaffolder-ticket-09-'))
  temporaryRoots.push(repositoryRoot)
  await mkdir(join(repositoryRoot, 'packages'))
  await mkdir(join(repositoryRoot, 'scaffolder/templates'), { recursive: true })
  await cp(
    templateRoot,
    join(repositoryRoot, 'scaffolder/templates/nuxt-module'),
    {
      recursive: true,
    }
  )
  return repositoryRoot
}

async function listFiles(root: string, current = ''): Promise<string[]> {
  const directory = current ? join(root, current) : root
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const file = current ? `${current}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await listFiles(root, file)))
    else files.push(relative(root, join(root, file)))
  }

  return files.toSorted()
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
}

async function readGeneratedContents(
  root: string
): Promise<Map<string, string>> {
  const contents = new Map<string, string>()
  for (const file of await listFiles(root)) {
    contents.set(file, await readFile(join(root, file), 'utf8'))
  }
  return contents
}
