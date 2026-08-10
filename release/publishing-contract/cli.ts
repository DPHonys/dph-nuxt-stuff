import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import process from 'node:process'

interface Manifest {
  private?: boolean
  [key: string]: unknown
}

interface Workspace {
  directory: string
  manifest: Manifest
}

const repositoryRoot = resolve(
  process.argv.slice(2).find((argument) => argument !== '--') ?? process.cwd()
)

try {
  const workspaces = await discoverWorkspaces(repositoryRoot)
  const violations = validatePublishingContract(workspaces)
  if (violations.length) {
    for (const violation of violations) {
      console.error(`Publishing contract violation: ${violation}`)
    }
    process.exitCode = 1
  } else {
    console.log(
      `Publishing contract valid for ${workspaces.length} workspaces.`
    )
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Unable to check publishing contract: ${message}`)
  process.exitCode = 1
}

function validatePublishingContract(workspaces: Workspace[]): string[] {
  return workspaces.flatMap((workspace) => {
    if (workspace.manifest.private === true) return []
    if (!/^packages\/[^/]+$/.test(workspace.directory)) {
      return [
        `${workspace.directory}: only non-private direct children of packages/ may be published`,
      ]
    }

    const violations: string[] = []
    const add = (message: string): void => {
      violations.push(`${workspace.directory}: ${message}`)
    }
    const manifest = workspace.manifest
    const packageDirectory = workspace.directory.slice('packages/'.length)
    const expectedName = `@dphonys/${packageDirectory}`
    if (manifest.name !== expectedName) add(`name must be ${expectedName}`)
    if (!isSemanticVersion(manifest.version)) {
      add('version must be a valid semantic version')
    }
    if (!isNonEmptyString(manifest.license)) {
      add('license must be a non-empty string')
    }

    const engines = asRecord(manifest.engines)
    if (!isNonEmptyString(engines?.node)) {
      add('engines.node must be a non-empty string')
    }

    const repository = asRecord(manifest.repository)
    if (repository?.type !== 'git') add('repository.type must be git')
    if (
      repository?.url !== 'git+https://github.com/DPHonys/dph-nuxt-stuff.git'
    ) {
      add('repository.url must identify DPHonys/dph-nuxt-stuff')
    }
    if (repository?.directory !== workspace.directory) {
      add(`repository.directory must be ${workspace.directory}`)
    }

    if (
      !Array.isArray(manifest.files) ||
      manifest.files.length === 0 ||
      manifest.files.some(
        (file) =>
          typeof file !== 'string' ||
          (file !== 'dist' && !file.startsWith('dist/'))
      )
    ) {
      add('files must declare distribution-only contents')
    }
    if (
      !isNonEmptyString(manifest.main) ||
      !manifest.main.startsWith('./dist/')
    ) {
      add('main must declare a distribution runtime entry point')
    }

    const typesVersions = asRecord(manifest.typesVersions)
    if (!typesVersions || Object.keys(typesVersions).length === 0) {
      add('typesVersions must declare the public type entry point')
    }
    const exports = asRecord(manifest.exports)
    if (!exports || !asRecord(exports['.'])) {
      add('exports must declare the public package entry point')
    }

    const publishConfig = asRecord(manifest.publishConfig)
    if (publishConfig?.access !== 'public') {
      add('publishConfig.access must be public')
    }
    const scripts = asRecord(manifest.scripts)
    if (
      !isNonEmptyString(scripts?.prepack) ||
      !/\bbuild\b/.test(scripts.prepack)
    ) {
      add('scripts.prepack must run the package build')
    }

    return violations
  })
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSemanticVersion(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const match =
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i.exec(
      value
    )
  if (!match) return false
  return !match[1]
    ?.split('.')
    .some((identifier) => /^\d+$/.test(identifier) && /^0\d+/.test(identifier))
}

async function discoverWorkspaces(root: string): Promise<Workspace[]> {
  const patterns = await readWorkspacePatterns(root)
  const manifestPaths = await findManifestPaths(root)
  const workspacePaths = manifestPaths.filter((path) => {
    const directory = normalize(relative(root, resolve(path, '..')))
    return directory === '' || matchesWorkspace(directory, patterns)
  })

  return Promise.all(
    workspacePaths.toSorted().map(async (path) => ({
      directory: normalize(relative(root, resolve(path, '..'))) || '.',
      manifest: JSON.parse(await readFile(path, 'utf8')) as Manifest,
    }))
  )
}

async function readWorkspacePatterns(root: string): Promise<string[]> {
  const source = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const lines = source.split(/\r?\n/)
  const packagesLine = lines.findIndex((line) => /^packages:\s*$/.test(line))
  if (packagesLine === -1) {
    throw new Error('pnpm-workspace.yaml has no packages list')
  }

  const patterns: string[] = []
  for (const line of lines.slice(packagesLine + 1)) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('- ')) {
      patterns.push(
        trimmed
          .slice(2)
          .trim()
          .replace(/^(['"])(.*)\1$/, '$2')
      )
      continue
    }
    if (line.trim() && !/^\s/.test(line)) break
  }
  return patterns
}

async function findManifestPaths(root: string): Promise<string[]> {
  const manifests: string[] = []
  await visit(root)
  return manifests

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name === 'package.json') {
          manifests.push(join(directory, entry.name))
          return
        }
        if (
          !entry.isDirectory() ||
          entry.name === 'node_modules' ||
          entry.name === '.git'
        ) {
          return
        }
        await visit(join(directory, entry.name))
      })
    )
  }
}

function matchesWorkspace(directory: string, patterns: string[]): boolean {
  let included = false
  for (const pattern of patterns) {
    const excluded = pattern.startsWith('!')
    if (matchesPattern(directory, excluded ? pattern.slice(1) : pattern)) {
      included = !excluded
    }
  }
  return included
}

function matchesPattern(value: string, pattern: string): boolean {
  const expression = pattern
    .split('/')
    .map((segment) => {
      if (segment === '**') return '(?:[^/]+(?:/|$))*'
      return segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replaceAll('*', '[^/]*')
        .replaceAll('?', '[^/]')
    })
    .join('/')
  return new RegExp(`^${expression}$`).test(value)
}

function normalize(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/')
}
