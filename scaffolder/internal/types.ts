import type { PackageJson } from 'pkg-types'

export interface ScaffoldNaming {
  scaffoldName: string
  destination: string
  packageName: string
  moduleName: string
  configKey: string
  runtimeInjection: string
  displayName: string
  defaultMessage: string
  playgroundPackageName: string
  fixturePackageName: string
}

export interface ScaffoldRequest {
  templateKind: string
  scaffoldName: string
  description?: string | undefined
}

export type InteractionResult =
  | { status: 'confirmed'; request: ScaffoldRequest }
  | { status: 'declined' }
  | { status: 'cancelled' }

export interface InteractionAdapter {
  request: (options: {
    repositoryRoot: string
    signal?: AbortSignal | undefined
    templates: readonly TemplateSummary[]
  }) => Promise<InteractionResult>
  progress: (event: ScaffoldProgressEvent) => void
}

export type ScaffoldProgressEvent =
  | { phase: 'render'; message: 'Rendering and validating package' }
  | {
      phase: 'install'
      message: 'Installing workspace dependencies with pnpm'
    }
  | { phase: 'format'; message: `Formatting ${string}` }

export interface TemplateSummary {
  id: string
  label: string
  scaffoldNameInitialValue?: string | undefined
}

export interface TemplatePreparationInput {
  scaffoldName: string
  description?: string | undefined
  year: number
}

export interface TemplatePreparationContext extends TemplatePreparationInput {
  naming: ScaffoldNaming
}

export interface TemplatePreparation {
  operations: readonly RenderOperation[]
  validations?: readonly ValidationRule[]
}

export interface TemplateDefinition {
  id: string
  label: string
  scaffoldNameInitialValue?: string
  sourceDirectory: string
  requiredFiles: readonly string[]
  allowedTextTokens: readonly string[]
  prepare: (context: TemplatePreparationContext) => TemplatePreparation
}

export interface PreparedTemplate {
  template: TemplateSummary
  sourceDirectory: string
  destination: string
  requiredFiles: readonly string[]
  allowedTextTokens: readonly string[]
  naming: ScaffoldNaming
  operations: readonly RenderOperation[]
  validations: readonly ValidationRule[]
}

export type RenderOperation =
  | {
      kind: 'replace-text'
      file: string
      replacements: Readonly<Record<string, string>>
    }
  | {
      kind: 'write-package-json'
      file: string
      updates: Readonly<PackageJson>
    }
  | {
      kind: 'mutate-typescript'
      file: string
      recipe: NuxtModuleIdentityRecipe
    }

export interface NuxtModuleIdentityRecipe {
  name: 'set-nuxt-module-identities'
  moduleName: string
  configKey: string
}

export type ValidationRule =
  | { kind: 'required-files'; files: readonly string[] }
  | { kind: 'no-unresolved-tokens'; tokens: readonly string[] }
  | {
      kind: 'package-json-fields'
      file: string
      expected: Readonly<PackageJson>
    }
  | { kind: 'text-contains'; file: string; values: readonly string[] }

export interface PostCommitContext {
  repositoryRoot: string
  destination: string
  signal?: AbortSignal | undefined
}

export interface InstallerAdapter {
  install: (context: PostCommitContext) => Promise<void>
}

export interface FormatterAdapter {
  format: (context: PostCommitContext) => Promise<void>
}

export type OwnedScaffoldArtifact =
  | { kind: 'lock'; path: string }
  | { kind: 'staging'; path: string }

export interface ScaffoldTransactionOperations {
  render: (options: {
    repositoryRoot: string
    stagingRoot: string
    plan: PreparedTemplate
  }) => Promise<void>
  removeOwnedArtifact: (artifact: OwnedScaffoldArtifact) => Promise<void>
}

export interface ScaffoldDependencies {
  interaction: InteractionAdapter
  registry: TemplateRegistry
  installer: InstallerAdapter
  formatter: FormatterAdapter
  now: () => Date
  nonce: () => string
  /** Internal fault-injection seam; production uses the real operations. */
  transaction?: Partial<ScaffoldTransactionOperations>
}

export interface TemplateRegistry {
  list: () => readonly TemplateSummary[]
  get: (id: string) => TemplateDefinition | undefined
}

interface OutcomeBase {
  exitCode: 0 | 1 | 130
}

export type ScaffoldOutcome =
  | (OutcomeBase & {
      status: 'created'
      exitCode: 0
      packageName: string
      destination: string
    })
  | (OutcomeBase & { status: 'declined' | 'cancelled'; exitCode: 0 })
  | (OutcomeBase & {
      status: 'collision'
      exitCode: 1
      destination: string
      reason: 'destination-exists' | 'lock-held'
    })
  | (OutcomeBase & {
      status: 'generation-failed'
      exitCode: 1
      error: Error
    })
  | (OutcomeBase & {
      status: 'cleanup-failed'
      exitCode: 1 | 130
      error: Error
      cleanupError: Error
      retainedArtifact: string
    })
  | (OutcomeBase & {
      status: 'lock-release-failed'
      exitCode: 1
      error: Error
      packageName: string
      destination: string
      retainedArtifact: string
    })
  | (OutcomeBase & {
      status: 'install-failed' | 'format-failed'
      exitCode: 1
      error: Error
      packageName: string
      destination: string
    })
  | (OutcomeBase & {
      status: 'interrupted-before-commit'
      exitCode: 130
      error: Error
    })
  | (OutcomeBase & {
      status: 'interrupted-after-commit'
      exitCode: 130
      error: Error
      packageName: string
      destination: string
    })

export interface Scaffolder {
  run: (options: {
    repositoryRoot: string
    signal?: AbortSignal
  }) => Promise<ScaffoldOutcome>
}
