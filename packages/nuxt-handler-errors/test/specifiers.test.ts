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

  it('carry the reader to a call site that never imported it', async () => {
    // SPEC.md §3.7's auto-import half, which only a real app can show: `app.vue`
    // calls `useDeclaredError` with **no import statement**, so the module's
    // `addImports` registration is the only thing that can resolve the name.
    // The compile-time half of that is `vue-tsc` over `playground/tsconfig.json`
    // in the `typecheck` script; this is the runtime half, and it also proves
    // the composable runs during SSR and finds the variant on a real failure.
    //
    // The hand-writable specifier stays the contract: the same page reaches the
    // same reader through `#shared/reader-probe`, which imports it by name from
    // `@dphonys/nuxt-handler-errors/shared`.
    const html = await $fetch<string>('/')

    // The auto-imported `useDeclaredError`, over a real failed `useFetch`.
    expect(html).toContain('user-not-found/404')
    // And the same failure handed to a `shared/` helper that imported
    // `declaredError` by its published specifier, narrowed there on the tag and
    // rendered with its payload — the contract half, in the same render.
    expect(html).toContain('user-not-found: missing')
  })

  it('resolve from the Nitro server', async () => {
    const body = await $fetch<{
      server: string
      shared: string
      caught: string
    }>('/api/specifier-probe')

    expect(body).toEqual({
      server: `server:${DECLARED_ERROR_KEY}`,
      shared: `shared:${DECLARED_ERROR_KEY}`,
      // The reader itself **running** inside Nitro, over a real server-to-server
      // failure caught in a `catch` — the third context SPEC.md §3.7 puts the
      // value form on the side-agnostic specifier for, and the one no
      // client-side call site can stand in for now that `/shared` carries a
      // `vue` import.
      caught: 'user-suspended',
    })
  })
})
