import type { RunResult } from '@dphonys/test-utils/run'
import { run as runCommand } from '@dphonys/test-utils/run'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const command = resolve(import.meta.dirname, '../cli.ts')
const temporaryRoots: string[] = []

/**
 * The manifest fields the contract inspects. Every field but `name` is
 * optional so a mutation can delete it to exercise the missing-field path.
 */
interface FixtureManifest {
  name: string
  private?: boolean
  version?: string
  license?: string
  engines?: { node?: string }
  repository?: { type?: string; url?: string; directory?: string }
  files?: string[]
  main?: string
  typesVersions?: Record<string, Record<string, string[]>>
  exports?: Record<string, Record<string, string>>
  publishConfig?: { access?: string }
  scripts?: Record<string, string>
}
type ManifestMutation = (manifest: FixtureManifest) => void

const invalidMetadataCases = [
  [
    'semantic version',
    (manifest) => (manifest.version = 'next'),
    'version must be a valid semantic version',
  ],
  [
    'license',
    (manifest) => delete manifest.license,
    'license must be a non-empty string',
  ],
  [
    'Node engine',
    (manifest) => (manifest.engines = {}),
    'engines.node must be a non-empty string',
  ],
  [
    'repository type',
    (manifest) =>
      (manifest.repository = { ...manifest.repository, type: 'svn' }),
    'repository.type must be git',
  ],
  [
    'repository identity',
    (manifest) =>
      (manifest.repository = {
        ...manifest.repository,
        url: 'https://github.com/somewhere/else.git',
      }),
    'repository.url must identify DPHonys/dph-nuxt-stuff',
  ],
  [
    'repository directory',
    (manifest) =>
      (manifest.repository = {
        ...manifest.repository,
        directory: 'packages/somewhere-else',
      }),
    'repository.directory must be packages/example',
  ],
  [
    'packaged files',
    (manifest) => (manifest.files = ['src']),
    'files must declare distribution-only contents',
  ],
  [
    'runtime entry point',
    (manifest) => delete manifest.main,
    'main must declare a distribution runtime entry point',
  ],
  [
    'type entry point',
    (manifest) => delete manifest.typesVersions,
    'typesVersions must declare the public type entry point',
  ],
  [
    'exports',
    (manifest) => delete manifest.exports,
    'exports must declare the public package entry point',
  ],
  [
    'public access',
    (manifest) => (manifest.publishConfig = { access: 'restricted' }),
    'publishConfig.access must be public',
  ],
  [
    'prepack build',
    (manifest) => (manifest.scripts = {}),
    'scripts.prepack must run the package build',
  ],
] satisfies ReadonlyArray<readonly [string, ManifestMutation, string]>

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('publishing contract command', () => {
  it('accepts private support workspaces without imposing publication metadata', async () => {
    const repositoryRoot = await createRepository(
      {
        scaffolder: { name: '@dphonys/scaffolder', private: true },
        'packages/example': { name: '@dphonys/example', private: true },
        'packages/example/playground': {
          name: '@dphonys/example-playground',
          private: true,
        },
      },
      undefined,
      ['scaffolder', 'packages/*', 'packages/*/playground']
    )

    const result = await run(repositoryRoot)

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Publishing contract valid for 4 workspaces.\n',
      stderr: '',
    })
  })

  it('accepts a correctly admitted direct package', async () => {
    const repositoryRoot = await createRepository({
      'packages/example': validPublishableManifest('example'),
    })

    const result = await run(repositoryRoot)

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Publishing contract valid for 2 workspaces.\n',
      stderr: '',
    })
  })

  it('rejects a non-private repository root at the Publication boundary', async () => {
    const repositoryRoot = await createRepository({}, { name: 'fixture-root' })

    const result = await run(repositoryRoot)

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain(
      '.: only non-private direct children of packages/ may be published'
    )
  })

  it.each([
    'scaffolder',
    'packages/example/playground',
    'packages/example/test/fixtures/consumer',
    'packages/group/example',
    'tools/example',
  ])('rejects the non-private support workspace %s', async (workspace) => {
    const repositoryRoot = await createRepository({
      [workspace]: { name: '@dphonys/not-a-publishable-package' },
    })

    const result = await run(repositoryRoot)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(
      `${workspace}: only non-private direct children of packages/ may be published`
    )
  })

  it('rejects an unexpected package identity with an actionable diagnostic', async () => {
    const manifest = validPublishableManifest('example')
    manifest.name = '@elsewhere/example'
    const repositoryRoot = await createRepository({
      'packages/example': manifest,
    })

    const result = await run(repositoryRoot)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(
      'packages/example: name must be @dphonys/example'
    )
  })

  it.each(invalidMetadataCases)(
    'rejects an admitted package with invalid %s metadata',
    async (_responsibility, mutate, diagnostic) => {
      const manifest = validPublishableManifest('example')
      mutate(manifest)
      const repositoryRoot = await createRepository({
        'packages/example': manifest,
      })

      const result = await run(repositoryRoot)

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain(`packages/example: ${diagnostic}`)
    }
  )

  it('reports every discovered violation in one run', async () => {
    const invalidPackage = validPublishableManifest('one')
    invalidPackage.version = 'invalid'
    delete invalidPackage.license
    const repositoryRoot = await createRepository({
      'packages/one': invalidPackage,
      'packages/one/playground': { name: '@dphonys/one-playground' },
      tools: { name: '@dphonys/tools' },
    })

    const result = await run(repositoryRoot)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(
      'packages/one: version must be a valid semantic version'
    )
    expect(result.stderr).toContain(
      'packages/one: license must be a non-empty string'
    )
    expect(result.stderr).toContain(
      'packages/one/playground: only non-private direct children of packages/ may be published'
    )
    expect(result.stderr).toContain(
      'tools: only non-private direct children of packages/ may be published'
    )
  })
})

async function createRepository(
  workspaces: Record<string, FixtureManifest>,
  rootManifest: FixtureManifest = {
    name: 'fixture-root',
    private: true,
  },
  workspacePatterns: string[] = Object.keys(workspaces)
): Promise<string> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), 'publishing-contract-test-')
  )
  temporaryRoots.push(repositoryRoot)

  await writeJson(join(repositoryRoot, 'package.json'), rootManifest)
  await writeFile(
    join(repositoryRoot, 'pnpm-workspace.yaml'),
    `packages:\n${workspacePatterns
      .map((workspace) => `  - ${workspace}`)
      .join('\n')}\n`,
    'utf8'
  )
  await Promise.all(
    Object.entries(workspaces).map(async ([workspace, manifest]) => {
      await writeJson(join(repositoryRoot, workspace, 'package.json'), manifest)
    })
  )
  return repositoryRoot
}

function validPublishableManifest(name: string): FixtureManifest {
  return {
    name: `@dphonys/${name}`,
    version: '1.2.3',
    license: 'MIT',
    engines: { node: '>=26.0.0' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/DPHonys/dph-nuxt-stuff.git',
      directory: `packages/${name}`,
    },
    files: ['dist'],
    main: './dist/module.mjs',
    typesVersions: { '*': { '.': ['./dist/types.d.mts'] } },
    exports: {
      '.': {
        types: './dist/types.d.mts',
        import: './dist/module.mjs',
      },
    },
    publishConfig: { access: 'public' },
    scripts: { prepack: 'pnpm run build' },
  }
}

async function writeJson(path: string, value: FixtureManifest): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, undefined, 2)}\n`, 'utf8')
}

/** The contract over one repository; a non-zero exit is a finding, not a failure. */
function run(repositoryRoot: string): Promise<RunResult> {
  return runCommand('node', [command, repositoryRoot])
}
