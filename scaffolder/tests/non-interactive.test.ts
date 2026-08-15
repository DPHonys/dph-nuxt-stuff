import { describe, expect, it } from 'vitest'
import {
  createNonInteractiveAdapter,
  resolveScaffoldCliRequest,
} from '../internal/non-interactive'
import type { ScaffoldProgressEvent, TemplateSummary } from '../internal/types'

const templates: readonly TemplateSummary[] = [
  {
    id: 'nuxt-module',
    label: 'Nuxt module',
    scaffoldNameInitialValue: 'nuxt-',
  },
]

describe('scaffold CLI mode resolution', () => {
  it('scaffolds interactively when no scaffold flag is present', () => {
    expect(
      resolveScaffoldCliRequest({
        template: undefined,
        name: undefined,
        description: undefined,
      })
    ).toEqual({ mode: 'interactive' })
  })

  it('builds a complete non-interactive request from the flags', () => {
    expect(
      resolveScaffoldCliRequest({
        template: 'nuxt-module',
        name: 'api-2-client',
        description: 'A typed API client',
      })
    ).toEqual({
      mode: 'non-interactive',
      request: {
        templateKind: 'nuxt-module',
        scaffoldName: 'api-2-client',
        description: 'A typed API client',
      },
    })
  })

  it('represents an omitted description as absent', () => {
    expect(
      resolveScaffoldCliRequest({
        template: 'nuxt-module',
        name: 'api-2-client',
        description: undefined,
      })
    ).toEqual({
      mode: 'non-interactive',
      request: { templateKind: 'nuxt-module', scaffoldName: 'api-2-client' },
    })
  })

  it.each([
    {
      flags: {
        template: 'nuxt-module',
        name: undefined,
        description: undefined,
      },
      missing: '--name',
    },
    {
      flags: {
        template: undefined,
        name: 'api-2-client',
        description: undefined,
      },
      missing: '--template',
    },
    {
      flags: {
        template: undefined,
        name: undefined,
        description: 'A typed API client',
      },
      missing: '--template and --name',
    },
  ])(
    'refuses a partial flag set instead of prompting for $missing',
    ({ flags, missing }) => {
      expect(resolveScaffoldCliRequest(flags)).toEqual({
        mode: 'usage-error',
        message:
          `Non-interactive scaffolding requires ${missing}. ` +
          'Pass every required flag, or none to scaffold interactively.',
      })
    }
  )
})

describe('non-interactive interaction', () => {
  it('confirms a fully specified request without prompting', async () => {
    const adapter = createNonInteractiveAdapter(
      {
        templateKind: 'nuxt-module',
        scaffoldName: 'api-2-client',
        description: 'A typed API client',
      },
      () => {}
    )

    await expect(
      adapter.request({ repositoryRoot: '/repository', templates })
    ).resolves.toEqual({
      status: 'confirmed',
      request: {
        templateKind: 'nuxt-module',
        scaffoldName: 'api-2-client',
        description: 'A typed API client',
      },
    })
  })

  it('rejects an unknown Template kind and lists the valid kinds', async () => {
    const adapter = createNonInteractiveAdapter(
      { templateKind: 'vite-plugin', scaffoldName: 'image-tools' },
      () => {}
    )

    await expect(
      adapter.request({ repositoryRoot: '/repository', templates })
    ).rejects.toThrow(
      'Unknown Template kind: vite-plugin. Valid kinds: nuxt-module.'
    )
  })

  it('rejects an invalid scaffold name with the shared diagnostic', async () => {
    const adapter = createNonInteractiveAdapter(
      { templateKind: 'nuxt-module', scaffoldName: 'Not-Canonical' },
      () => {}
    )

    await expect(
      adapter.request({ repositoryRoot: '/repository', templates })
    ).rejects.toThrow(
      'Invalid scaffold name "Not-Canonical": Use lowercase letters, ' +
        'numbers, and single hyphens; start with a letter ' +
        '(for example, image-tools).'
    )
  })

  it('forwards progress events to the provided sink', () => {
    const events: ScaffoldProgressEvent[] = []
    const adapter = createNonInteractiveAdapter(
      { templateKind: 'nuxt-module', scaffoldName: 'api-2-client' },
      (event) => events.push(event)
    )

    adapter.progress({
      phase: 'render',
      message: 'Rendering and validating package',
    })

    expect(events).toEqual([
      { phase: 'render', message: 'Rendering and validating package' },
    ])
  })
})
