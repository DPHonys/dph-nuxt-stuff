import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

/** Every manifest, publishable or not, must at least say whether it is private. */
const admissionSchema = z.object({ private: z.boolean().optional() })

/**
 * The publication contract for a package admitted under `packages/`. Each
 * rule carries one diagnostic, repeated on every node of the rule's shape so
 * a missing key and a malformed value read the same.
 */
function publishableManifestSchema(directory: string): z.ZodType {
  const expectedName = `@dphonys/${directory.slice('packages/'.length)}`
  const version = 'version must be a valid semantic version'
  const engines = 'engines.node must be a non-empty string'
  const repository = `repository must be an object with type git, url identifying DPHonys/dph-nuxt-stuff, and directory ${directory}`
  const files = 'files must declare distribution-only contents'
  const main = 'main must declare a distribution runtime entry point'
  const typesVersions = 'typesVersions must declare the public type entry point'
  const exports = 'exports must declare the public package entry point'
  const publishConfig = 'publishConfig.access must be public'
  const scripts = 'scripts.prepack must run the package build'

  return z.object({
    name: z.literal(expectedName, `name must be ${expectedName}`),
    version: z.string(version).refine(isSemanticVersion, version),
    license: nonEmptyString('license must be a non-empty string'),
    engines: z.object({ node: nonEmptyString(engines) }, engines),
    repository: z.object(
      {
        type: z.literal('git', 'repository.type must be git'),
        url: z.literal(
          'git+https://github.com/DPHonys/dph-nuxt-stuff.git',
          'repository.url must identify DPHonys/dph-nuxt-stuff'
        ),
        directory: z.literal(
          directory,
          `repository.directory must be ${directory}`
        ),
      },
      repository
    ),
    files: z
      .array(z.string(files), files)
      .refine(
        (entries) =>
          entries.length > 0 &&
          entries.every((file) => file === 'dist' || file.startsWith('dist/')),
        files
      ),
    main: z.string(main).startsWith('./dist/', main),
    typesVersions: z
      .record(
        z.string(),
        z.record(
          z.string(),
          z.array(z.string(typesVersions), typesVersions),
          typesVersions
        ),
        typesVersions
      )
      .refine((entries) => Object.keys(entries).length > 0, typesVersions),
    exports: z.object({ '.': z.looseObject({}, exports) }, exports),
    publishConfig: z.object(
      { access: z.literal('public', publishConfig) },
      publishConfig
    ),
    scripts: z.object(
      { prepack: z.string(scripts).regex(/\bbuild\b/, scripts) },
      scripts
    ),
  })
}

function nonEmptyString(message: string): z.ZodString {
  return z.string(message).trim().min(1, message)
}

function isSemanticVersion(value: string): boolean {
  const match =
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i.exec(
      value
    )
  if (!match) return false
  return !match[1]
    ?.split('.')
    .some((identifier) => /^\d+$/.test(identifier) && /^0\d+/.test(identifier))
}

async function discoverWorkspaces(root: string): Promise<string[][]> {
  const patterns = await readWorkspacePatterns(root)
  const manifestPaths = await findManifestPaths(root)
  const workspacePaths = manifestPaths.filter((path) => {
    const directory = normalize(relative(root, resolve(path, '..')))
    return directory === '' || matchesWorkspace(directory, patterns)
  })

  return Promise.all(
    workspacePaths
      .toSorted()
      .map(async (path) =>
        readWorkspace(
          normalize(relative(root, resolve(path, '..'))) || '.',
          await readFile(path, 'utf8')
        )
      )
  )
}

/**
 * pnpm rewrites `workspace:` protocols on publish. `workspace:^`, `workspace:~`
 * and `workspace:*` take the sibling's version at publish time, so they track it
 * automatically. Every other form carries its own version — `workspace:1.2.3`
 * publishes as `1.2.3` and `workspace:^1.2.3` as `^1.2.3` — and silently goes
 * stale the moment the sibling's version moves, so the contract rejects them.
 */
const workspaceDependencySchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
})
type WorkspaceDependencies = z.infer<typeof workspaceDependencySchema>

/** The violations one workspace carries, each prefixed with its directory. */
function readWorkspace(directory: string, manifestSource: string): string[] {
  const manifest = JSON.parse(manifestSource)
  if (admissionSchema.parse(manifest).private === true) return []
  if (!/^packages\/[^/]+$/.test(directory)) {
    return [
      `${directory}: only non-private direct children of packages/ may be published`,
    ]
  }

  const contract = publishableManifestSchema(directory).safeParse(manifest)
  const violations = new Set([
    ...(contract.error?.issues.map((issue) => issue.message) ?? []),
    ...readSiblingPins(workspaceDependencySchema.parse(manifest)),
  ])
  return [...violations].map((violation) => `${directory}: ${violation}`)
}

function readSiblingPins(manifest: WorkspaceDependencies): string[] {
  const sections = [
    ['dependencies', manifest.dependencies],
    ['optionalDependencies', manifest.optionalDependencies],
  ] as const
  return sections.flatMap(([section, specifiers]) =>
    Object.entries(specifiers ?? {})
      .filter(
        ([, specifier]) =>
          specifier.startsWith('workspace:') &&
          !['workspace:^', 'workspace:~', 'workspace:*'].includes(specifier)
      )
      .map(
        ([name, specifier]) =>
          `${section}.${name} must use workspace:^, workspace:~, or workspace:* rather than ${specifier}`
      )
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

const repositoryRoot = resolve(
  process.argv.slice(2).find((argument) => argument !== '--') ?? process.cwd()
)

try {
  const workspaces = await discoverWorkspaces(repositoryRoot)
  const violations = workspaces.flat()
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
