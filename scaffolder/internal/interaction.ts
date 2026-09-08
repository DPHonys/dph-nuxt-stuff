import {
  confirm,
  intro,
  isCancel,
  log,
  note,
  select,
  text,
} from '@clack/prompts'
import { lstatSync } from 'node:fs'
import { resolve } from 'pathe'
import { createNaming, validateScaffoldName } from './naming'
import type {
  InteractionAdapter,
  ScaffoldProgressEvent,
  ScaffoldRequest,
  TemplateSummary,
} from './types'

type PromptResult<T> = T | symbol

export interface SelectPromptOptions {
  message: string
  options: Array<{ value: string; label: string }>
  initialValue: string
  signal?: AbortSignal
}

export interface TextPromptOptions {
  message: string
  defaultValue?: string
  initialValue?: string
  signal?: AbortSignal
  validate?: (value: string | undefined) => string | undefined
}

export interface ConfirmPromptOptions {
  message: string
  initialValue: boolean
  signal?: AbortSignal
}

export interface InteractionPrompts {
  intro: (message: string) => void
  select: (options: SelectPromptOptions) => Promise<PromptResult<string>>
  text: (options: TextPromptOptions) => Promise<PromptResult<string>>
  note: (message: string, title: string) => void
  confirm: (options: ConfirmPromptOptions) => Promise<PromptResult<boolean>>
  progress: (event: ScaffoldProgressEvent) => void
  isCancel: (value: unknown) => value is symbol
}

export function createInteractiveAdapter(
  prompts: InteractionPrompts
): InteractionAdapter {
  return {
    async request({ repositoryRoot, signal, templates }) {
      const firstTemplate = templates[0]
      if (!firstTemplate) {
        throw new Error('The Template registry is empty.')
      }

      prompts.intro('Scaffold a workspace package')

      const templateKind = await prompts.select(
        withSignal<SelectPromptOptions>(
          {
            message: 'Template kind',
            options: templates.map(({ id, label }) => ({ value: id, label })),
            initialValue: firstTemplate.id,
          },
          signal
        )
      )
      if (prompts.isCancel(templateKind)) return { status: 'cancelled' }
      const template = findTemplate(templates, templateKind)

      const scaffoldNamePrompt: TextPromptOptions = {
        message: 'Scaffold name',
        validate(value) {
          const name = value ?? ''
          const invalidName = validateScaffoldName(name)
          if (invalidName) return invalidName

          const destination = `packages/${name}`
          if (pathExists(resolve(repositoryRoot, destination))) {
            return `${destination} already exists. Choose a different scaffold name.`
          }
        },
      }
      if (template.scaffoldNameInitialValue) {
        scaffoldNamePrompt.initialValue = template.scaffoldNameInitialValue
      }
      const scaffoldName = await prompts.text(
        withSignal(scaffoldNamePrompt, signal)
      )
      if (prompts.isCancel(scaffoldName)) return { status: 'cancelled' }

      const descriptionInput = await prompts.text(
        withSignal<TextPromptOptions>(
          { message: 'Description (optional)', defaultValue: '' },
          signal
        )
      )
      if (prompts.isCancel(descriptionInput)) return { status: 'cancelled' }

      const naming = createNaming(scaffoldName)
      const description = descriptionInput.trim()
      prompts.note(
        formatReview({
          template,
          destination: naming.destination,
          packageName: naming.packageName,
          moduleName: naming.moduleName,
          configKey: naming.configKey,
          displayName: naming.displayName,
          description,
        }),
        'Review'
      )

      const confirmed = await prompts.confirm(
        withSignal<ConfirmPromptOptions>(
          { message: 'Create this package?', initialValue: false },
          signal
        )
      )
      if (prompts.isCancel(confirmed)) return { status: 'cancelled' }
      if (!confirmed) return { status: 'declined' }

      const request: ScaffoldRequest = { templateKind, scaffoldName }
      if (description) request.description = description
      return { status: 'confirmed', request }
    },
    progress(event) {
      prompts.progress(event)
    },
  }
}

export function createClackInteraction(): InteractionAdapter {
  return createInteractiveAdapter({
    intro,
    select,
    text,
    note,
    confirm,
    progress(event) {
      log.step(event.message)
    },
    isCancel,
  })
}

/**
 * Prompt options carry `signal` only when the caller has one: the prompt
 * option types are exact, so an absent signal is an absent key.
 */
function withSignal<Options extends { signal?: AbortSignal }>(
  options: Options,
  signal: AbortSignal | undefined
): Options {
  return signal ? { ...options, signal } : options
}

function formatReview(options: {
  template: TemplateSummary
  destination: string
  packageName: string
  moduleName: string
  configKey: string
  displayName: string
  description: string
}): string {
  const rows = [
    ['Template kind', options.template.label],
    ['Directory', options.destination],
    ['Package', options.packageName],
    ['Nuxt module', options.moduleName],
    ['Config key', options.configKey],
    ['Display name', options.displayName],
    ['Description', options.description || '(none)'],
  ]

  return rows.map(([label, value]) => `${label?.padEnd(16)}${value}`).join('\n')
}

function findTemplate(
  templates: readonly TemplateSummary[],
  id: string
): TemplateSummary {
  const template = templates.find((candidate) => candidate.id === id)
  if (!template) throw new Error(`Unknown Template kind: ${id}`)
  return template
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
