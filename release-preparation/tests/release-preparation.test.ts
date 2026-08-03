import { execFile } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '../..')
const rootManifest = JSON.parse(
  await readFile(join(repositoryRoot, 'package.json'), 'utf8')
) as { packageManager: string }
const pinnedPnpmVersion = rootManifest.packageManager.replace(/^pnpm@/, '')
const pnpmExecutable = process.env.npm_execpath ?? 'pnpm'
const temporaryRoots: string[] = []

interface PackageManifest {
  name: string
  version: string
  dependencies?: Record<string, string>
}

interface CommandResult {
  stdout: string
  stderr: string
}

class LocalRegistry {
  readonly publishedVersions = new Map<string, Set<string>>()
  server: Server | undefined
  url = ''

  publish(name: string, version: string): void {
    const versions = this.publishedVersions.get(name) ?? new Set<string>()
    versions.add(version)
    this.publishedVersions.set(name, versions)
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://registry.test')
      const name = decodeURIComponent(requestUrl.pathname.slice(1))
      const versions = this.publishedVersions.get(name)

      response.setHeader('content-type', 'application/json')
      if (!versions) {
        response.statusCode = 404
        response.end(JSON.stringify({ error: 'not_found' }))
        return
      }

      response.end(
        JSON.stringify({
          name,
          versions: Object.fromEntries(
            [...versions].map((version) => [
              version,
              {
                name,
                version,
                dist: {
                  tarball: `${this.url}${encodeURIComponent(name)}/-/${version}.tgz`,
                },
              },
            ])
          ),
        })
      )
    })
    this.server.listen(0, '127.0.0.1')
    await once(this.server, 'listening')
    const address = this.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Local registry did not bind a TCP port')
    }
    this.url = `http://127.0.0.1:${address.port}/`
  }

  async stop(): Promise<void> {
    if (!this.server) return
    this.server.close()
    await once(this.server, 'close')
  }
}

const registry = new LocalRegistry()

beforeAll(async () => {
  await registry.start()
  const { stdout } = await run(pnpmExecutable, ['--version'], repositoryRoot)
  expect(stdout.trim()).toBe(pinnedPnpmVersion)
})

afterAll(async () => {
  await registry.stop()
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('pnpm Independent package release preparation', () => {
  it('changes only the unrelated package named by one Release intent', async () => {
    const root = await createRepository([
      { name: '@fixture/one', version: '1.0.0' },
      { name: '@fixture/two', version: '2.0.0' },
    ])
    registry.publish('@fixture/one', '1.0.0')
    registry.publish('@fixture/two', '2.0.0')
    const intent = await recordIntent(
      root,
      '@fixture/one',
      'minor',
      'Add the consumer-facing one API.'
    )
    await commitAll(root, 'record Release intent')

    const status = await runPnpm(root, ['change', 'status'])
    expect(status.stdout).toContain('@fixture/one: 1.0.0 → 1.1.0')
    expect(status.stdout).not.toContain('@fixture/two:')

    const beforeDryRun = await repositoryState(root)
    const dryRun = await runPnpm(root, ['version', '-r', '--dry-run'])
    expect(dryRun.stdout).toContain('@fixture/one: 1.0.0 → 1.1.0')
    expect(await repositoryState(root)).toEqual(beforeDryRun)

    await runPnpm(root, ['version', '-r'])

    expect(await packageVersion(root, '@fixture/one')).toBe('1.1.0')
    expect(await packageVersion(root, '@fixture/two')).toBe('2.0.0')
    await expect(
      readFile(packagePath(root, '@fixture/two', 'CHANGELOG.md'), 'utf8')
    ).rejects.toThrow()
    expect(
      await readFile(packagePath(root, '@fixture/one', 'CHANGELOG.md'), 'utf8')
    ).toContain('Add the consumer-facing one API.')
    expect(
      await readFile(join(root, '.changeset/ledger.yaml'), 'utf8')
    ).toContain('"@fixture/one@1.1.0":')
    expect(
      await readFile(join(root, '.changeset/ledger.yaml'), 'utf8')
    ).not.toContain('@fixture/two@')
    await expect(
      readFile(join(root, '.changeset', intent), 'utf8')
    ).rejects.toThrow()
  })

  it('leaves a downstream package unchanged when its workspace range stays compatible', async () => {
    const root = await createRepository([
      { name: '@fixture/core-compatible', version: '1.0.0' },
      {
        name: '@fixture/consumer-compatible',
        version: '3.0.0',
        dependencies: { '@fixture/core-compatible': 'workspace:^' },
      },
    ])
    registry.publish('@fixture/core-compatible', '1.0.0')
    registry.publish('@fixture/consumer-compatible', '3.0.0')
    await recordIntent(
      root,
      '@fixture/core-compatible',
      'minor',
      'Extend the compatible core API.'
    )
    await commitAll(root, 'record Release intent')

    const preview = await runPnpm(root, ['version', '-r', '--dry-run'])
    expect(preview.stdout).toContain('@fixture/core-compatible: 1.0.0 → 1.1.0')
    expect(preview.stdout).not.toContain('@fixture/consumer-compatible:')

    await runPnpm(root, ['version', '-r'])

    expect(await packageVersion(root, '@fixture/core-compatible')).toBe('1.1.0')
    expect(await packageVersion(root, '@fixture/consumer-compatible')).toBe(
      '3.0.0'
    )
  })

  it('adds exactly one Dependency-only release when an upstream version invalidates the workspace range', async () => {
    const root = await createRepository([
      { name: '@fixture/core-breaking', version: '1.0.0' },
      {
        name: '@fixture/consumer-breaking',
        version: '3.0.0',
        dependencies: { '@fixture/core-breaking': 'workspace:^' },
      },
    ])
    registry.publish('@fixture/core-breaking', '1.0.0')
    registry.publish('@fixture/consumer-breaking', '3.0.0')
    await recordIntent(
      root,
      '@fixture/core-breaking',
      'major',
      'Replace the core consumer contract.'
    )
    await commitAll(root, 'record Release intent')

    const preview = await runPnpm(root, ['version', '-r', '--dry-run'])
    expect(preview.stdout).toContain('@fixture/core-breaking: 1.0.0 → 2.0.0')
    expect(preview.stdout).toContain(
      '@fixture/consumer-breaking: 3.0.0 → 3.0.1 (patch, via dependencies)'
    )

    await runPnpm(root, ['version', '-r'])

    expect(await packageVersion(root, '@fixture/consumer-breaking')).toBe(
      '3.0.1'
    )
    const downstreamChangelog = await readFile(
      packagePath(root, '@fixture/consumer-breaking', 'CHANGELOG.md'),
      'utf8'
    )
    expect(downstreamChangelog).toContain('Updated dependencies:')
    expect(downstreamChangelog).toContain('@fixture/core-breaking@2.0.0')
    const ledger = await readFile(join(root, '.changeset/ledger.yaml'), 'utf8')
    expect(ledger).toContain('"@fixture/core-breaking@2.0.0":')
    expect(ledger).not.toContain('@fixture/consumer-breaking@')

    const packedManifest = await packManifest(
      root,
      '@fixture/consumer-breaking'
    )
    expect(packedManifest.dependencies).toEqual({
      '@fixture/core-breaking': '^2.0.0',
    })
  }, 10_000)

  it('keeps the seeded version for a registry-absent first release', async () => {
    const root = await createRepository([
      { name: '@fixture/first-release', version: '0.0.1' },
    ])
    await recordIntent(
      root,
      '@fixture/first-release',
      'minor',
      'Publish the initial consumer contract.'
    )
    await commitAll(root, 'record first Release intent')

    const status = await runPnpm(root, ['change', 'status'])
    expect(status.stdout).toContain('@fixture/first-release: 0.0.1 → 0.0.1')

    await runPnpm(root, ['version', '-r'])

    expect(await packageVersion(root, '@fixture/first-release')).toBe('0.0.1')
    expect(
      await readFile(
        packagePath(root, '@fixture/first-release', 'CHANGELOG.md'),
        'utf8'
      )
    ).toContain('## 0.0.1')
    expect(
      await readFile(join(root, '.changeset/ledger.yaml'), 'utf8')
    ).toContain('"@fixture/first-release@0.0.1":')
  })

  it('consumes every pending intent in one unfiltered run without a Git commit or tag', async () => {
    const root = await createRepository([
      { name: '@fixture/all-one', version: '1.0.0' },
      { name: '@fixture/all-two', version: '2.0.0' },
    ])
    registry.publish('@fixture/all-one', '1.0.0')
    registry.publish('@fixture/all-two', '2.0.0')
    const firstIntent = await recordIntent(
      root,
      '@fixture/all-one',
      'patch',
      'Correct the first package output.'
    )
    const secondIntent = await recordIntent(
      root,
      '@fixture/all-two',
      'minor',
      'Add the second package capability.'
    )
    await commitAll(root, 'record all Release intents')
    const commitBefore = await git(root, ['rev-parse', 'HEAD'])

    const status = await runPnpm(root, ['change', 'status'])
    expect(status.stdout).toContain(`.changeset/${firstIntent}`)
    expect(status.stdout).toContain(`.changeset/${secondIntent}`)
    expect(status.stdout).toContain('@fixture/all-one: 1.0.0 → 1.0.1')
    expect(status.stdout).toContain('@fixture/all-two: 2.0.0 → 2.1.0')

    await runPnpm(root, ['version', '-r'])

    expect(await packageVersion(root, '@fixture/all-one')).toBe('1.0.1')
    expect(await packageVersion(root, '@fixture/all-two')).toBe('2.1.0')
    expect(await git(root, ['rev-parse', 'HEAD'])).toBe(commitBefore)
    expect(await git(root, ['tag', '--list'])).toBe('')
    expect(
      (await readdir(join(root, '.changeset'))).filter((name) =>
        name.endsWith('.md')
      )
    ).toEqual([])
    const ledger = await readFile(join(root, '.changeset/ledger.yaml'), 'utf8')
    expect(ledger).toContain('"@fixture/all-one@1.0.1":')
    expect(ledger).toContain('"@fixture/all-two@2.1.0":')
  })
})

async function createRepository(packages: PackageManifest[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'release-preparation-test-'))
  temporaryRoots.push(root)
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'release-preparation-fixture',
        private: true,
        packageManager: rootManifest.packageManager,
      },
      null,
      2
    )}\n`
  )
  await writeFile(
    join(root, 'pnpm-workspace.yaml'),
    [
      'packages:',
      '  - packages/*',
      '',
      'versioning:',
      '  changelog:',
      '    storage: repository',
      '',
    ].join('\n')
  )
  await writeFile(
    join(root, '.npmrc'),
    `registry=${registry.url}\nfetch-retries=0\n`
  )
  await writeFile(join(root, '.gitignore'), 'node_modules\npacked\n')
  for (const manifest of packages) {
    const directory = packageDirectory(root, manifest.name)
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    )
    await writeFile(join(directory, 'index.js'), 'export {}\n')
  }
  if (packages.some((manifest) => manifest.dependencies)) {
    await runPnpm(root, ['install', '--ignore-scripts'])
  }
  await git(root, ['init', '--quiet', '--initial-branch=main'])
  await git(root, ['config', 'user.email', 'release-fixture@example.test'])
  await git(root, ['config', 'user.name', 'Release fixture'])
  await commitAll(root, 'initial fixture')
  return root
}

async function recordIntent(
  root: string,
  packageName: string,
  bump: 'patch' | 'minor' | 'major',
  summary: string
): Promise<string> {
  const before = new Set(await changesetMarkdownFiles(root))
  const result = await runPnpm(root, [
    'change',
    '--bump',
    bump,
    '--summary',
    summary,
    packageName,
  ])
  expect(result.stdout).toContain('Recorded change intent .changeset/')
  const created = (await changesetMarkdownFiles(root)).filter(
    (name) => !before.has(name)
  )
  expect(created).toHaveLength(1)
  return created[0]!
}

async function changesetMarkdownFiles(root: string): Promise<string[]> {
  try {
    return (await readdir(join(root, '.changeset')))
      .filter((name) => name.endsWith('.md'))
      .toSorted()
  } catch {
    return []
  }
}

async function packManifest(
  root: string,
  packageName: string
): Promise<PackageManifest> {
  const destination = join(root, 'packed')
  await mkdir(destination)
  const packed = await runPnpm(root, [
    '--filter',
    packageName,
    'pack',
    '--json',
    '--pack-destination',
    destination,
  ])
  const result = JSON.parse(packed.stdout) as
    | { filename: string }
    | Array<{ filename: string }>
  const filename = Array.isArray(result) ? result[0]!.filename : result.filename
  const tarball = resolve(packageDirectory(root, packageName), filename)
  const extracted = await run(
    'tar',
    ['-xOf', tarball, 'package/package.json'],
    root
  )
  return JSON.parse(extracted.stdout) as PackageManifest
}

async function packageVersion(root: string, name: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(packagePath(root, name, 'package.json'), 'utf8')
  ) as PackageManifest
  return manifest.version
}

function packagePath(root: string, name: string, file: string): string {
  return join(packageDirectory(root, name), file)
}

function packageDirectory(root: string, name: string): string {
  return join(root, 'packages', name.replace(/^@/, '').replace('/', '-'))
}

async function repositoryState(root: string): Promise<{
  commit: string
  status: string
  tags: string
}> {
  return {
    commit: await git(root, ['rev-parse', 'HEAD']),
    status: await git(root, ['status', '--short']),
    tags: await git(root, ['tag', '--list']),
  }
}

async function commitAll(root: string, message: string): Promise<void> {
  await git(root, ['add', '.'])
  await git(root, ['commit', '--quiet', '--no-gpg-sign', '-m', message])
}

async function git(root: string, arguments_: string[]): Promise<string> {
  return (await run('git', arguments_, root)).stdout.trim()
}

async function runPnpm(
  root: string,
  arguments_: string[]
): Promise<CommandResult> {
  return run(pnpmExecutable, arguments_, root)
}

async function run(
  executable: string,
  arguments_: string[],
  cwd: string
): Promise<CommandResult> {
  try {
    const result = await execFileAsync(executable, arguments_, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string }
    throw new Error(
      [failure.message, failure.stdout, failure.stderr]
        .filter((part) => part?.trim())
        .join('\n'),
      { cause: error }
    )
  }
}
