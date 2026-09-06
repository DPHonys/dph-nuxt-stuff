import { spawn } from 'node:child_process'
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createProductionTemplateRegistry,
  nuxtCompatibilityRange,
} from '../internal/nuxt-module'
import {
  createProductionFormatter,
  createProductionInstaller,
} from '../internal/production'
import { createScaffolder } from '../internal/scaffolder'

const workspaceRoot = resolve(import.meta.dirname, '../..')
const temporaryRoots: string[] = []
const generatedFiles = [
  'LICENSE',
  'README.md',
  'package.json',
  'playground/app.vue',
  'playground/nuxt.config.ts',
  'playground/package.json',
  'playground/server/tsconfig.json',
  'playground/tsconfig.json',
  'playground/turbo.json',
  'src/module.ts',
  'src/runtime/plugin.ts',
  'src/runtime/server/tsconfig.json',
  'test/basic.test.ts',
  'test/fixtures/basic/app.vue',
  'test/fixtures/basic/nuxt.config.ts',
  'test/fixtures/basic/package.json',
  'tsconfig.json',
]
const prohibitedFiles = [
  '.eslintignore',
  '.eslintrc',
  '.gitignore',
  '.npmignore',
  '.prettierignore',
  '.prettierrc',
  'CHANGELOG.md',
  'eslint.config.ts',
  'playwright.config.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'prettier.config.ts',
  'server/tsconfig.json',
  'vitest.config.ts',
]

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('disposable Acceptance fixture', () => {
  it('proves the production Scaffolder and Repository support together', async () => {
    const repositoryRoot = await createDisposableRepository()
    const destination = join(repositoryRoot, 'packages/api-2-client')
    const progress: string[] = []
    let preInstallContractChecked = false
    const productionInstaller = createProductionInstaller()

    const scaffolder = createScaffolder({
      registry: createProductionTemplateRegistry(),
      interaction: {
        async request() {
          return {
            status: 'confirmed',
            request: {
              templateKind: 'nuxt-module',
              scaffoldName: 'api-2-client',
              description: '  A typed API client for Nuxt  ',
            },
          }
        },
        progress(event) {
          progress.push(event.phase)
        },
      },
      installer: {
        async install(context) {
          await assertPreInstallContract(repositoryRoot, destination)
          preInstallContractChecked = true
          await productionInstaller.install(context)
        },
      },
      formatter: createProductionFormatter(),
      now: () => new Date('2042-06-15T00:00:00.000Z'),
      nonce: () => 'acceptance',
    })

    const outcome = await scaffolder.run({ repositoryRoot })

    expect(outcome).toEqual({
      status: 'created',
      exitCode: 0,
      packageName: '@dphonys/api-2-client',
      destination: 'packages/api-2-client',
    })
    expect(preInstallContractChecked).toBe(true)
    expect(progress).toEqual(['render', 'install', 'format'])
    await expect(
      pathExists(join(repositoryRoot, 'pnpm-lock.yaml'))
    ).resolves.toBe(true)

    await run('pnpm', ['exec', 'oxfmt', '--check', 'packages/api-2-client'], {
      cwd: repositoryRoot,
    })

    const pnpmWorkspace = z.array(z.object({ name: z.string() })).parse(
      JSON.parse(
        await run('pnpm', ['list', '--recursive', '--depth', '-1', '--json'], {
          cwd: repositoryRoot,
        })
      )
    )
    expect(pnpmWorkspace.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        '@dphonys/api-2-client',
        '@dphonys/api-2-client-playground',
      ])
    )

    const turboWorkspace = z
      .object({
        packages: z.object({ items: z.array(z.object({ name: z.string() })) }),
      })
      .parse(
        JSON.parse(
          await run('pnpm', ['exec', 'turbo', 'ls', '--output=json'], {
            cwd: repositoryRoot,
          })
        )
      )
    expect(turboWorkspace.packages.items.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        '@dphonys/api-2-client',
        '@dphonys/api-2-client-playground',
      ])
    )

    const nuxtPackages = z
      .array(
        z.object({
          devDependencies: z.optional(
            z.object({
              nuxt: z.optional(z.object({ version: z.string() })),
            })
          ),
        })
      )
      .parse(
        JSON.parse(
          await run(
            'pnpm',
            [
              '--filter',
              '@dphonys/api-2-client',
              'list',
              'nuxt',
              '--depth',
              '0',
              '--json',
            ],
            { cwd: repositoryRoot }
          )
        )
      )
    // The fixture installs with no lockfile, so nuxt resolves fresh and a
    // pinned patch literal here goes stale on every nuxt release. The
    // scaffold's contract is `nuxtCompatibilityRange`; assert its bounds.
    const nuxtVersion = nuxtPackages[0]?.devDependencies?.nuxt?.version ?? ''
    const [, floor = '', ceilingMajor = ''] =
      /^>=(\d+\.\d+\.\d+) <(\d+)\.0\.0$/.exec(nuxtCompatibilityRange) ?? []
    expect(
      floor,
      `nuxtCompatibilityRange '${nuxtCompatibilityRange}' is no longer a plain '>=x.y.z <N.0.0' range, so the bounds check below needs rewriting`
    ).not.toBe('')
    expect(compareVersions(nuxtVersion, floor)).toBeGreaterThanOrEqual(0)
    expect(compareVersions(nuxtVersion, `${ceilingMajor}.0.0`)).toBeLessThan(0)

    await run('pnpm', ['run', 'build'], { cwd: repositoryRoot })
    for (const script of ['lint', 'test', 'typecheck', 'publint']) {
      await run('pnpm', ['--filter', '@dphonys/api-2-client', 'run', script], {
        cwd: repositoryRoot,
      })
    }

    const playgroundOutput = join(destination, 'playground/.output')
    await expect(treeContains(playgroundOutput, 'Api 2 Client')).resolves.toBe(
      true
    )
    await expect(
      treeContains(playgroundOutput, 'Hello from Api 2 Client')
    ).resolves.toBe(true)
  }, 900_000)
})

async function assertPreInstallContract(
  repositoryRoot: string,
  destination: string
): Promise<void> {
  expect(await listFiles(destination)).toEqual(generatedFiles)
  for (const prohibited of prohibitedFiles) {
    await expect(pathExists(join(destination, prohibited))).resolves.toBe(false)
  }
  await expect(
    pathExists(join(repositoryRoot, 'pnpm-lock.yaml'))
  ).resolves.toBe(false)
  await expect(readdir(join(repositoryRoot, 'packages'))).resolves.toEqual([
    'api-2-client',
  ])

  const manifest = await readJson(join(destination, 'package.json'))
  expect(manifest).toEqual({
    name: '@dphonys/api-2-client',
    version: '0.0.1',
    private: true,
    description: 'A typed API client for Nuxt',
    type: 'module',
    sideEffects: false,
    license: 'MIT',
    engines: { node: '^22.19.0 || ^24.11.0 || >=26.0.0' },
    keywords: ['nuxt', 'nuxt-module', 'api-2-client'],
    repository: {
      type: 'git',
      url: 'git+https://github.com/DPHonys/dph-nuxt-stuff.git',
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
      prebuild: 'nuxt-module-build prepare',
      build: 'nuxt-module-build build',
      prepack: 'pnpm run build',
      dev: 'pnpm run dev:prepare && nuxt dev playground',
      'dev:build': 'nuxt build playground',
      'dev:prepare':
        'nuxt-module-build build --stub && nuxt-module-build prepare && nuxt prepare playground',
      lint: 'eslint .',
      pretest: 'nuxt-module-build prepare',
      pretypecheck: 'pnpm run build',
      typecheck:
        'nuxt prepare playground && vue-tsc --noEmit && vue-tsc --noEmit --project playground/tsconfig.json',
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
    scripts: {
      build: 'nuxt build',
    },
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
  expect(contents.get('src/module.ts')).toMatch(/name: ['"]api-2-client['"]/)
  expect(contents.get('src/module.ts')).toMatch(/configKey: ['"]api2Client['"]/)
  expect(contents.get('src/module.ts')).toContain(
    `compatibility: { nuxt: '${nuxtCompatibilityRange}' }`
  )
  expect(contents.get('src/module.ts')).toContain(
    "message: 'Hello from Api 2 Client'"
  )
  expect(contents.get('src/module.ts')).toContain(
    'runtimeConfig.public.api2Client'
  )
  expect(contents.get('src/module.ts')).toContain(
    "options.message ?? 'Hello from Api 2 Client'"
  )
  expect(contents.get('src/runtime/plugin.ts')).toContain(
    'api2Client: { message: starter.message }'
  )
  expect(contents.get('playground/nuxt.config.ts')).toContain(
    "modules: ['@dphonys/api-2-client']"
  )
  expect(contents.get('playground/app.vue')).toContain('<h1>Api 2 Client</h1>')
  expect(contents.get('playground/app.vue')).toContain(
    '{{ $api2Client.message }}'
  )
  expect(contents.get('test/fixtures/basic/nuxt.config.ts')).toContain(
    "message: 'Configured by the Api 2 Client test fixture'"
  )
  expect(contents.get('test/basic.test.ts')).toContain(
    "expect(html).toContain('<p>Configured by the Api 2 Client test fixture</p>')"
  )

  const readme = contents.get('README.md') ?? ''
  expect(readme).toContain('# Api 2 Client\n\nA typed API client for Nuxt')
  for (const section of [
    '## Installation',
    '## Registration and configuration',
    '## Usage',
    '## Options',
    '## Repository development',
    '## License',
  ]) {
    expect(readme).toContain(section)
  }
  expect(readme).toContain("modules: ['@dphonys/api-2-client']")
  expect(readme).toContain('api2Client')
  expect(readme).toContain('$api2Client')

  const allContents = [...contents.values()].join('\n')
  expect(allContents.match(/TODO:/g)).toHaveLength(3)
  expect(allContents).not.toContain('SCAFFOLD_')
  expect(allContents).not.toContain('nuxt-module-template')

  const workspace = await readFile(
    join(repositoryRoot, 'pnpm-workspace.yaml'),
    'utf8'
  )
  expect(workspace).toContain('nuxt: ^4.5.1')
}

async function createDisposableRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'scaffolder-acceptance-'))
  temporaryRoots.push(repositoryRoot)
  await mkdir(join(repositoryRoot, 'packages'))
  await mkdir(join(repositoryRoot, 'templates'), { recursive: true })

  for (const file of [
    'eslint.config.ts',
    'oxfmt.config.ts',
    'oxlint.config.ts',
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'turbo.json',
  ]) {
    await cp(join(workspaceRoot, file), join(repositoryRoot, file))
  }
  await cp(
    join(workspaceRoot, 'templates/nuxt-module'),
    join(repositoryRoot, 'templates/nuxt-module'),
    { recursive: true }
  )

  return repositoryRoot
}

async function run(
  command: string,
  arguments_: string[],
  options: { cwd: string }
): Promise<string> {
  const result = await new Promise<{
    exitCode: number | null
    stdout: string
    stderr: string
  }>((settle, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: { ...process.env, CI: '1' },
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
    child.once('close', (exitCode) => settle({ exitCode, stdout, stderr }))
  })
  if (result.exitCode !== 0) {
    throw new Error(
      [
        `${command} ${arguments_.join(' ')} exited with ${result.exitCode ?? 'a signal'}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n')
    )
  }
  return result.stdout
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

async function readGeneratedContents(
  root: string
): Promise<Map<string, string>> {
  const contents = new Map<string, string>()
  for (const file of await listFiles(root)) {
    contents.set(file, await readFile(join(root, file), 'utf8'))
  }
  return contents
}

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0))
      return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return 0
}

/** The values `JSON.parse` can produce. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

async function readJson(file: string): Promise<JsonValue> {
  return JSON.parse(await readFile(file, 'utf8'))
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function treeContains(root: string, expected: string): Promise<boolean> {
  for (const file of await listFiles(root)) {
    if (file.endsWith('.map')) continue
    const path = join(root, file)
    const stats = await lstat(path)
    if (stats.size > 2 * 1024 * 1024) continue
    if ((await readFile(path, 'utf8')).includes(expected)) return true
  }
  return false
}
