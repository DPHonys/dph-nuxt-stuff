import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DECLARED_ERROR_KEY } from '../src/runtime/shared'

/**
 * The playground is the e2e fixture on purpose: it is a separate workspace
 * package that consumes the module through its *published* specifiers, so this
 * suite exercises the real `exports` map rather than a relative source import.
 * That is why the package-level `turbo.json` gives `test` a dependency on this
 * package's own `build` (SPEC.md §8.2).
 *
 * What is under test is resolution, not the wire key, so the expectations are
 * derived from the constant rather than restating its value.
 */
describe('the published specifiers', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../playground', import.meta.url)),
    server: true,
    browser: false,
  })

  it('resolve from the client and from a consumer shared/ directory', async () => {
    const html = await $fetch<string>('/')

    expect(html).toContain(`client:${DECLARED_ERROR_KEY}`)
    expect(html).toContain(`shared:${DECLARED_ERROR_KEY}`)

    // `app.vue` narrows the generated map's entry for `/api/users/:id` on the
    // tag, in `<script setup>`. The narrowing itself is a compile-time
    // assertion checked by `vue-tsc`; this is what keeps the runtime side of it
    // from being surface nothing looks at.
    expect(html).toContain('forbidden, needs owner')
  })

  it('resolve from the Nitro server', async () => {
    const body = await $fetch<{ server: string; shared: string }>(
      '/api/specifier-probe'
    )

    expect(body).toEqual({
      server: `server:${DECLARED_ERROR_KEY}`,
      shared: `shared:${DECLARED_ERROR_KEY}`,
    })
  })
})
