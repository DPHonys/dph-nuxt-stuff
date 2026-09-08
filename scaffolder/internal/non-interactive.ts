import { log } from '@clack/prompts'
import { validateScaffoldName } from './naming'
import type {
  InteractionAdapter,
  ScaffoldProgressEvent,
  ScaffoldRequest,
} from './types'

export type ScaffoldCliResolution =
  | { mode: 'interactive' }
  | { mode: 'non-interactive'; request: ScaffoldRequest }
  | { mode: 'usage-error'; message: string }

/**
 * Decides the CLI mode from the scaffold flags. Any flag opts into the
 * non-interactive mode, which is all-or-nothing: missing required flags are a
 * usage error rather than a fallback to prompts, so unattended callers can
 * never hang on a hidden prompt.
 */
export function resolveScaffoldCliRequest(flags: {
  template: string | undefined
  name: string | undefined
  description: string | undefined
}): ScaffoldCliResolution {
  if (
    flags.template === undefined &&
    flags.name === undefined &&
    flags.description === undefined
  ) {
    return { mode: 'interactive' }
  }

  if (flags.template === undefined || flags.name === undefined) {
    const missing = [
      ...(flags.template === undefined ? ['--template'] : []),
      ...(flags.name === undefined ? ['--name'] : []),
    ]
    return {
      mode: 'usage-error',
      message:
        `Non-interactive scaffolding requires ${missing.join(' and ')}. ` +
        'Pass every required flag, or none to scaffold interactively.',
    }
  }

  return {
    mode: 'non-interactive',
    request: {
      templateKind: flags.template,
      scaffoldName: flags.name,
      description: flags.description,
    },
  }
}

export function createNonInteractiveAdapter(
  request: ScaffoldRequest,
  progress: (event: ScaffoldProgressEvent) => void
): InteractionAdapter {
  return {
    async request({ templates }) {
      const template = templates.find(({ id }) => id === request.templateKind)
      if (!template) {
        const kinds = templates.map(({ id }) => id).join(', ')
        throw new Error(
          `Unknown Template kind: ${request.templateKind}. Valid kinds: ${kinds}.`
        )
      }

      const invalidName = validateScaffoldName(request.scaffoldName)
      if (invalidName) {
        throw new Error(
          `Invalid scaffold name ${JSON.stringify(request.scaffoldName)}: ${invalidName}`
        )
      }

      return { status: 'confirmed', request }
    },
    progress,
  }
}

export function createClackNonInteractiveInteraction(
  request: ScaffoldRequest
): InteractionAdapter {
  return createNonInteractiveAdapter(request, (event) => {
    log.step(event.message)
  })
}
