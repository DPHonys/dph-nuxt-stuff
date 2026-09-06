import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

type Workspace =
  | { directory: string; publication: 'private' }
  | { directory: string; publication: 'public'; violations: readonly string[] }

function validatePublishingContract(workspaces: Workspace[]): string[] {
  return workspaces.flatMap((workspace) => {
    if (workspace.publication === 'private') return []
    if (!/^packages\/[^/]+$/.test(workspace.directory)) {
      return [
        `${workspace.directory}: only non-private direct children of packages/ may be published`,
      ]
    }
    return workspace.violations.map(
      (violation) => `${workspace.directory}: ${violation}`
    )
  })
}

/** Every manifest, publishable or not, must at least say whether it is private. */
const admissionSchema = z.object({ private: z.boolean().optional() })

/**
 * The publication contract for a package admitted under `packages/`. The
 * schema describes the shape; `diagnostic` phrases each failing rule.
 */
function publishableManifestSchema(directory: string): z.ZodType {
  const expectedName = `@dphonys/${directory.slice('packages/'.length)}`
  return z.object({
    name: z.literal(expectedName),
    version: z.string().refine(isSemanticVersion),
    license: nonEmptyString(),
    engines: z.object({ node: nonEmptyString() }),
    repository: z.object({
      type: z.literal('git'),
      url: z.literal('git+https://github.com/DPHonys/dph-nuxt-stuff.git'),
      directory: z.literal(directory),
    }),
    files: z
      .array(z.string())
      .refine(
        (entries) =>
          entries.length > 0 &&
          entries.every((file) => file === 'dist' || file.startsWith('dist/'))
      ),
    main: z.string().startsWith('./dist/'),
    typesVersions: z
      .record(z.string(), z.record(z.string(), z.array(z.string())))
      .refine((entries) => Object.keys(entries).length > 0),
    exports: z.object({ '.': z.looseObject({}) }),
    publishConfig: z.object({ access: z.literal('public') }),
    scripts: z.object({
      prepack: z.string().regex(/\bbuild\b/),
    }),
  })
}

function nonEmptyString(): z.ZodType<string> {
  return z.string().refine((value) => value.trim().length > 0)
}

/**
 * One actionable diagnostic per contract rule, keyed by where in the manifest
 * the schema issue arose. A missing key and a malformed value share a rule.
 */
function diagnostic(directory: string, issue: z.core.$ZodIssue): string {
  const [field, subfield] = issue.path.map((segment) => String(segment))
  switch (field) {
    case 'name':
      return `name must be @dphonys/${directory.slice('packages/'.length)}`
    case 'version':
      return 'version must be a valid semantic version'
    case 'license':
      return 'license must be a non-empty string'
    case 'engines':
      return 'engines.node must be a non-empty string'
    case 'repository':
      switch (subfield) {
        case 'type':
          return 'repository.type must be git'
        case 'url':
          return 'repository.url must identify DPHonys/dph-nuxt-stuff'
        case 'directory':
          return `repository.directory must be ${directory}`
        default:
          return `repository must be an object with type git, url identifying DPHonys/dph-nuxt-stuff, and directory ${directory}`
      }
    case 'files':
      return 'files must declare distribution-only contents'
    case 'main':
      return 'main must declare a distribution runtime entry point'
    case 'typesVersions':
      return 'typesVersions must declare the public type entry point'
    case 'exports':
      return 'exports must declare the public package entry point'
    case 'publishConfig':
      return 'publishConfig.access must be public'
    case 'scripts':
      return 'scripts.prepack must run the package build'
    default:
      return `manifest ${issue.message}`
  }
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

async function discoverWorkspaces(root: string): Promise<Workspace[]> {
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

function readWorkspace(directory: string, manifestSource: string): Workspace {
  const manifest = JSON.parse(manifestSource)
  const admission = admissionSchema.parse(manifest)
  if (admission.private === true) return { directory, publication: 'private' }

  const contract = publishableManifestSchema(directory).safeParse(manifest)
  const violations = new Set(
    contract.error?.issues.map((issue) => diagnostic(directory, issue))
  )
  return { directory, publication: 'public', violations: [...violations] }
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
