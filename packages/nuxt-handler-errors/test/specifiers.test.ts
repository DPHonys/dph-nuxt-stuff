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

  it('carry the composable to a call site that never imported it', async () => {
    // SPEC.md §3.4's composable, and the *only* contract it has: it calls
    // `useFetch`, which lives behind `#app`, so it cannot sit on any of
    // SPEC.md §3's three published specifiers and `addImports` is the whole
    // registration (SPEC-AMENDMENTS item 29). `app.vue` writes no import for it.
    //
    // What is rendered is the union narrowed exhaustively in a `shared/` helper
    // — so this one line covers the composable running under SSR, its error ref
    // really carrying the envelope, and the reader recovering the variant out
    // of it.
    const html = await $fetch<string>('/')

    expect(html).toContain('forbidden, needs owner')
  })

  it('carry the merged headers to a route outside /api/**', async () => {
    // **SPEC.md §3.8, run rather than reasoned about.** `/status` echoes the
    // two headers it was called with back inside its declared payload, so this
    // is the merge's real output on the SSR path — the path §3.8 exists for,
    // and the one that reaches h3's `fetchWithEvent`.
    //
    // Three mutations were measured against this one line, and each renders a
    // different failure:
    //
    // | mutation | renders |
    // | --- | --- |
    // | the merged `Headers` handed on **unflattened** | `none/none` |
    // | a naive `{ accept, ...opts.headers }` spread | `application/json/none` |
    // | `accept` not set at all | `none/kept` |
    //
    // Row 1 is SPEC-AMENDMENTS item 30: `fetchWithEvent` merges by object
    // spread, and a `Headers` instance has no own enumerable properties, so it
    // discards the caller's headers *and* this module's own `accept`. Row 2 is
    // the shipped-defect-class bug SPEC.md §3.8 names, with the caller passing
    // the legal `Headers` form. Row 3 is the header genuinely not arriving by
    // any other route.
    //
    // The assertion is on the header the server **received**, not on whether
    // the response was JSON: measured, `@nuxt/test-utils`' own client forwards
    // `sec-fetch-mode: cors` through `getProxyRequestHeaders`, which satisfies
    // `isJsonRequest` on its own and makes the JSON/HTML consequence
    // unobservable from here (SPEC-AMENDMENTS item 31).
    const html = await $fetch<string>('/')

    expect(html).toContain('payment-required/application/json/kept')
  })

  it('carry the global $typedFetch to a client call site', async () => {
    // SPEC.md §3.5's global, in `<script setup>` with **no import and no
    // auto-import**: `app.vue` writes `$typedFetch.safe(…)` the way it would
    // write `$fetch`. The type comes from the `declare global` in `/types`,
    // which the emitted map pulls into every program; the value comes from the
    // app plugin the module registers. Delete the plugin and this line renders
    // an error page instead.
    //
    // What is rendered is `.safe`'s false arm narrowed exhaustively in a
    // `shared/` helper, so this one string covers the global being installed,
    // the reader having run inside the wrapper, and the variant arriving flat.
    const html = await $fetch<string>('/')

    expect(html).toContain('global:forbidden, needs owner')

    // And the other half of `.safe`'s one sentence: a route that declared
    // nothing throws, exactly as vanilla does. Its result type has already
    // collapsed to the one-arm form, so the `ok: false` branch a caller would
    // need is not even expressible — which is SPEC.md §6.1's degradation lock
    // and the reason the collapse is mandatory on this surface.
    expect(html).toContain('/threw')
  })

  it('carry the global $typedFetch into a Nitro handler', async () => {
    // SPEC.md §3.5's *"callable inside a Nitro handler with no new entry
    // point"*, which is the criterion the whole global-versus-auto-import
    // decision exists to satisfy. `server/api/typed-fetch-probe.get.ts` imports
    // no fetch of any kind.
    const body = await $fetch<{
      declared: string
      undeclared: string
      headers: string
      instance: string
    }>('/api/typed-fetch-probe')

    expect(body).toEqual({
      // `.safe` answered the false arm with the callee's flat variant, which a
      // `shared/` helper then narrowed exhaustively — SPEC.md §3.6's blessed
      // server-to-server shape, one ticket early and with no new API.
      declared: 'user-suspended until 2026-12-31',

      // A hand-rolled 403 with `data` of its own and no marker. It **threw**,
      // and what it threw was not a declared failure — both halves, because a
      // `.safe` that reported every failure as declared would satisfy neither.
      undeclared: 'threw undeclared',

      // SPEC.md §3.8's global merge, on the wire, on a route outside `/api/**`
      // — the only place `accept` decides whether a declared failure comes back
      // as JSON at all. `/status` echoes back what it received.
      //
      // Two mutations were measured against this line and each renders
      // differently: dropping the `accept` set gives `none/kept`, and a naive
      // `{ accept, ...opts.headers }` spread over the `Headers` instance the
      // caller passed gives `application/json/none`.
      headers: 'application/json/kept',

      // `create`'s defaults combine losslessly with the module's own header:
      // the instance's `x-probe` reached the wire and `accept` was still added
      // on top (SPEC.md §3.8).
      instance: 'application/json/from-instance',
    })
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
