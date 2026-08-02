import { loadFile, writeFile as writeMagicastFile } from 'magicast'
import { cp, lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { readPackageJSON, sortPackage, writePackageJSON } from 'pkg-types'
import { resolveWithin } from './registry'
import type {
  NuxtModuleIdentityRecipe,
  PreparedTemplate,
  ValidationRule,
} from './types'

export class TemplateInvariantError extends Error {
  override name = 'TemplateInvariantError'
}

export async function renderPreparedTemplate(options: {
  repositoryRoot: string
  stagingRoot: string
  plan: PreparedTemplate
}): Promise<void> {
  const source = resolveWithin(
    options.repositoryRoot,
    options.plan.sourceDirectory
  )

  await copyTemplateContents(source, options.stagingRoot)

  for (const operation of options.plan.operations) {
    const file = resolveWithin(options.stagingRoot, operation.file)
    await requireRegularFile(file, operation.file)

    switch (operation.kind) {
      case 'replace-text': {
        let contents = await readFile(file, 'utf8')
        for (const [token, replacement] of Object.entries(
          operation.replacements
        )) {
          contents = contents.replaceAll(token, replacement)
        }
        await writeFile(file, contents, 'utf8')
        break
      }
      case 'write-package-json': {
        const current = await readPackageJSON(file)
        await writePackageJSON(
          file,
          sortPackage({ ...current, ...operation.updates })
        )
        break
      }
      case 'mutate-typescript': {
        await applyMagicastRecipe(file, operation.file, operation.recipe)
        break
      }
    }
  }

  for (const validation of options.plan.validations) {
    await validate(options.stagingRoot, validation)
  }
}

async function copyTemplateContents(
  source: string,
  stagingRoot: string
): Promise<void> {
  const entries = await readdir(source)
  for (const entry of entries) {
    await cp(join(source, entry), resolveWithin(stagingRoot, entry), {
      recursive: true,
      force: false,
      errorOnExist: true,
    })
  }
}

async function applyMagicastRecipe(
  file: string,
  displayFile: string,
  recipe: NuxtModuleIdentityRecipe
): Promise<void> {
  try {
    const module = await loadFile(file)
    const defaultExport: unknown = module.exports.default

    if (!hasProxyType(defaultExport, 'function-call')) {
      throw new Error('default export is not a function call')
    }
    if (defaultExport.$callee !== 'defineNuxtModule') {
      throw new Error('default export does not call defineNuxtModule')
    }
    if (!Array.isArray(defaultExport.$args)) {
      throw new TypeError('defineNuxtModule arguments are not inspectable')
    }

    const options: unknown = defaultExport.$args[0]
    if (!hasProxyType(options, 'object')) {
      throw new TypeError('defineNuxtModule argument is not an object')
    }

    const meta: unknown = options.meta
    if (!hasProxyType(meta, 'object')) {
      throw new Error('defineNuxtModule meta is not an object')
    }

    if (recipe.name === 'set-nuxt-module-identities') {
      meta.name = recipe.moduleName
      meta.configKey = recipe.configKey
    }

    await writeMagicastFile(module, file)
  } catch (error) {
    throw new TemplateInvariantError(
      `Unexpected TypeScript structure in ${displayFile}: ${errorMessage(error)}`,
      { cause: error }
    )
  }
}

async function validate(root: string, rule: ValidationRule): Promise<void> {
  switch (rule.kind) {
    case 'required-files': {
      for (const requiredFile of rule.files) {
        await requireRegularFile(
          resolveWithin(root, requiredFile),
          requiredFile
        )
      }
      break
    }
    case 'no-unresolved-tokens': {
      for (const file of await listRegularFiles(root)) {
        const contents = await readFile(file.absolute, 'utf8')
        for (const token of rule.tokens) {
          if (contents.includes(token)) {
            throw new TemplateInvariantError(
              `Unresolved Template token ${token} in ${file.relative}`
            )
          }
        }
      }
      break
    }
    case 'package-json-fields': {
      const packageFile = resolveWithin(root, rule.file)
      await requireRegularFile(packageFile, rule.file)
      const actual = await readPackageJSON(packageFile)
      if (!containsExpected(actual, rule.expected)) {
        throw new TemplateInvariantError(
          `Structured metadata validation failed for ${rule.file}`
        )
      }
      break
    }
    case 'text-contains': {
      const textFile = resolveWithin(root, rule.file)
      await requireRegularFile(textFile, rule.file)
      const contents = await readFile(textFile, 'utf8')
      for (const value of rule.values) {
        if (!contents.includes(value)) {
          throw new TemplateInvariantError(
            `${rule.file} does not contain required text: ${value}`
          )
        }
      }
      break
    }
  }
}

async function requireRegularFile(
  absolutePath: string,
  displayPath: string
): Promise<void> {
  let stats
  try {
    stats = await lstat(absolutePath)
  } catch (error) {
    throw new TemplateInvariantError(
      `Required file is missing: ${displayPath}`,
      {
        cause: error,
      }
    )
  }

  if (!stats.isFile()) {
    throw new TemplateInvariantError(
      `Template path is not a regular file: ${displayPath}`
    )
  }
}

async function listRegularFiles(
  root: string,
  current = ''
): Promise<Array<{ absolute: string; relative: string }>> {
  const directory = current ? resolveWithin(root, current) : root
  const entries = await readdir(directory, { withFileTypes: true })
  const files: Array<{ absolute: string; relative: string }> = []

  for (const entry of entries) {
    const relative = current ? `${current}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) {
      throw new TemplateInvariantError(
        `Template output contains a symbolic link: ${relative}`
      )
    }
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(root, relative)))
    } else if (entry.isFile()) {
      files.push({ absolute: resolveWithin(root, relative), relative })
    } else {
      throw new TemplateInvariantError(
        `Template output contains an unsupported filesystem entry: ${relative}`
      )
    }
  }

  return files
}

function hasProxyType(
  value: unknown,
  type: 'function-call' | 'object'
): value is Record<string, unknown> & { $type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).$type === type
  )
}

function containsExpected(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => containsExpected(actual[index], value))
    )
  }
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null) return false
    const actualRecord = actual as Record<string, unknown>
    return Object.entries(expected).every(([key, value]) =>
      containsExpected(actualRecord[key], value)
    )
  }
  return Object.is(actual, expected)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
