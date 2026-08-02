import { isAbsolute, normalize, relative, resolve } from 'pathe'
import { createNaming } from './naming'
import type {
  PreparedTemplate,
  TemplateDefinition,
  TemplatePreparationInput,
  TemplateRegistry,
  ValidationRule,
} from './types'

export class TemplatePlanError extends Error {
  override name = 'TemplatePlanError'
}

export function createTemplateRegistry(
  definitions: readonly TemplateDefinition[]
): TemplateRegistry {
  const entries = new Map<string, TemplateDefinition>()

  for (const definition of definitions) {
    if (entries.has(definition.id)) {
      throw new TemplatePlanError(`Duplicate Template kind: ${definition.id}`)
    }
    entries.set(definition.id, definition)
  }

  const summaries = Object.freeze(
    definitions.map(({ id, label }) => Object.freeze({ id, label }))
  )

  return Object.freeze({
    list: () => summaries,
    get: (id: string) => entries.get(id),
  })
}

export function prepareTemplate(
  definition: TemplateDefinition,
  input: TemplatePreparationInput
): PreparedTemplate {
  assertRelativePath(definition.sourceDirectory, 'Template source')
  for (const file of definition.requiredFiles) {
    assertRelativePath(file, 'Required file')
  }

  const naming = createNaming(input.scaffoldName)
  const context = Object.freeze({ ...input, naming })
  const preparation = definition.prepare(context)
  const validations: ValidationRule[] = [
    { kind: 'required-files', files: [...definition.requiredFiles] },
    {
      kind: 'no-unresolved-tokens',
      tokens: [...definition.allowedTextTokens],
    },
    ...(preparation.validations ?? []),
  ]

  for (const operation of preparation.operations) {
    assertRelativePath(operation.file, 'Render operation file')
    if (operation.kind === 'replace-text') {
      const allowedTokens = new Set(definition.allowedTextTokens)
      for (const token of Object.keys(operation.replacements)) {
        if (!allowedTokens.has(token)) {
          throw new TemplatePlanError(
            `Text replacement uses undeclared token: ${token}`
          )
        }
      }
    }
  }

  for (const validation of validations) {
    if ('file' in validation) {
      assertRelativePath(validation.file, 'Validation file')
    }
    if (validation.kind === 'required-files') {
      for (const file of validation.files) {
        assertRelativePath(file, 'Required file')
      }
    }
  }

  const plan: PreparedTemplate = {
    template: { id: definition.id, label: definition.label },
    sourceDirectory: definition.sourceDirectory,
    destination: naming.destination,
    requiredFiles: [...definition.requiredFiles],
    allowedTextTokens: [...definition.allowedTextTokens],
    naming,
    operations: [...preparation.operations],
    validations,
  }

  return deepFreeze(plan)
}

export function resolveWithin(root: string, requestedPath: string): string {
  assertRelativePath(requestedPath, 'Path')
  const absoluteRoot = resolve(root)
  const target = resolve(absoluteRoot, requestedPath)
  const fromRoot = relative(absoluteRoot, target)

  if (fromRoot === '..' || fromRoot.startsWith('../') || isAbsolute(fromRoot)) {
    throw new TemplatePlanError(`Path escapes its owned root: ${requestedPath}`)
  }

  return target
}

function assertRelativePath(path: string, label: string): void {
  const normalized = normalize(path)
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized !== path
  ) {
    throw new TemplatePlanError(`${label} is not path-confined: ${path}`)
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) {
      deepFreeze(child)
    }
  }
  return value
}
