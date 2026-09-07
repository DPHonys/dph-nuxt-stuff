import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const bootstrapPath = join(repositoryRoot, 'docs', 'first-release-bootstrap.md')

describe('first-release bootstrap contract', () => {
  it('preserves private seeded Generated packages until explicit admission', async () => {
    const templateManifest = z
      .object({
        private: z.boolean().optional(),
        version: z.string().optional(),
      })
      .parse(
        JSON.parse(
          await readFile(
            join(repositoryRoot, 'templates', 'nuxt-module', 'package.json'),
            'utf8'
          )
        )
      )
    const guide = await readFile(bootstrapPath, 'utf8')

    expect(templateManifest).toMatchObject({
      private: true,
      version: '0.0.1',
    })
    expect(guide).toContain('remove only `private: true`')
    expect(guide).toContain(
      'Commit the manifest change and first Release intent together.'
    )
    expect(guide).toMatch(
      /readiness\s+file, package allowlist, service, or admission workflow/
    )
    expect(guide).toContain('pnpm does not apply an extra first-release bump')
  })

  it('orders inspection before targeted interactive publication and trust registration', async () => {
    const guide = await readFile(bootstrapPath, 'utf8')
    const landedSection = guide.indexOf(
      '## 2. Recheck the landed Release commit'
    )
    const landedGate = guide.indexOf('pnpm check', landedSection)
    const tarballInspection = guide.indexOf(
      'pnpm --filter @dphonys/example pack --dry-run',
      landedGate
    )
    const login = guide.indexOf(
      'npm login --registry=https://registry.npmjs.org'
    )
    const publish = guide.indexOf(
      'pnpm --filter @dphonys/example publish --access public'
    )
    const exactInstall = guide.indexOf(
      'npm install --save-exact --registry=https://registry.npmjs.org @dphonys/example@0.0.1'
    )
    const trust = guide.indexOf(
      'npm trust github @dphonys/example --repo DPHonys/dph-nuxt-stuff --file publish.yml --allow-publish'
    )

    expect([
      landedGate,
      tarballInspection,
      login,
      publish,
      exactInstall,
      trust,
    ]).toSatisfy(
      (indexes: number[]) =>
        indexes.every((index) => index >= 0) &&
        indexes.every(
          (index, position) =>
            position === 0 ||
            index > (indexes[position - 1] ?? Number.NEGATIVE_INFINITY)
        )
    )
    expect(guide).not.toContain('pnpm publish -r')
    expect(guide).not.toMatch(/npm trust[^\n]+--(?:environment|allow-staged)/)
  })

  it('keeps bootstrap operations out of the ordinary trusted workflow', async () => {
    const workflow = await readFile(
      join(repositoryRoot, '.github', 'workflows', 'publish.yml'),
      'utf8'
    )
    const releaseGuide = await readFile(
      join(repositoryRoot, 'docs', 'release-preparation.md'),
      'utf8'
    )
    const bootstrapGuide = await readFile(bootstrapPath, 'utf8')

    expect(releaseGuide).toContain(
      '[First-release bootstrap](./first-release-bootstrap.md)'
    )
    expect(bootstrapGuide).toContain(
      'This consumer proof belongs only to First-release bootstrap'
    )
    expect(bootstrapGuide).toContain('Manual acceptance record')
    expect(bootstrapGuide).toContain('First OIDC publication')
    expect(bootstrapGuide).toContain(
      'Require two-factor authentication and disallow tokens'
    )
    expect(workflow).not.toMatch(/npm (?:login|trust)|nuxt prepare/)
  })
})
