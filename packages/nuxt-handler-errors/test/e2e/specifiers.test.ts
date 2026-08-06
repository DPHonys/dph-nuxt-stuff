import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DECLARED_ERROR_KEY, declaredError } from '../../src/runtime/shared'

/**
 * The playground is the e2e fixture on purpose: it is a separate workspace
 * package that consumes the module through its *published* specifiers, so this
 * suite exercises the real `exports` map rather than a relative source import.
 * That is why the package-level `turbo.json` gives `test` a dependency on this
 * package's own `build`.
 *
 * What is under test is resolution, not the wire key, so the expectations are
 * derived from the constant rather than restating its value.
 */
describe('the published specifiers', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
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
    // The auto-import half, which only a real app can show: `app.vue`
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
    // The composable, and the *only* contract it has: it calls
    // `useFetch`, which lives behind `#app`, so it cannot sit on any of
    // the three published specifiers and `addImports` is the whole
    // registration. `app.vue` writes no import for it.
    //
    // What is rendered is the union narrowed exhaustively in a `shared/` helper
    // — so this one line covers the composable running under SSR, its error ref
    // really carrying the envelope, and the reader recovering the variant out
    // of it.
    const html = await $fetch<string>('/')

    expect(html).toContain('forbidden, needs owner')
  })

  it('carry the merged headers to a route outside /api/**', async () => {
    // **The header merge, run rather than reasoned about.** `/status` echoes the
    // two headers it was called with back inside its declared payload, so this
    // is the merge's real output on the SSR path — the path the merge exists
    // for, and the one that reaches h3's `fetchWithEvent`.
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
    // Row 1: `fetchWithEvent` merges by object
    // spread, and a `Headers` instance has no own enumerable properties, so it
    // discards the caller's headers *and* this module's own `accept`. Row 2 is
    // the named shipped-defect-class bug, with the caller passing
    // the legal `Headers` form. Row 3 is the header genuinely not arriving by
    // any other route.
    //
    // The assertion is on the header the server **received**, not on whether
    // the response was JSON: measured, `@nuxt/test-utils`' own client forwards
    // `sec-fetch-mode: cors` through `getProxyRequestHeaders`, which satisfies
    // `isJsonRequest` on its own and makes the JSON/HTML consequence
    // unobservable from here.
    const html = await $fetch<string>('/')

    expect(html).toContain('payment-required/application/json/kept')
  })

  it('carry the global $typedFetch to a client call site', async () => {
    // The global, in `<script setup>` with **no import and no
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
    // need is not even expressible — which is the degradation lock
    // and the reason the collapse is mandatory on this surface.
    expect(html).toContain('/threw')
  })

  it('carry the global $typedFetch into a Nitro handler', async () => {
    // The global, *callable inside a Nitro handler with no new entry
    // point* — the criterion the whole global-versus-auto-import
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
      // `shared/` helper then narrowed exhaustively — the blessed
      // server-to-server shape, one ticket early and with no new API.
      declared: 'user-suspended until 2026-12-31',

      // A hand-rolled 403 with `data` of its own and no marker. It **threw**,
      // and what it threw was not a declared failure — both halves, because a
      // `.safe` that reported every failure as declared would satisfy neither.
      undeclared: 'threw undeclared',

      // The global merge, on the wire, on a route outside `/api/**`
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
      // on top.
      instance: 'application/json/from-instance',
    })
  })

  it('forward the request’s context through event.$typedFetch', async () => {
    // **The event-bound member's entire value proposition, with its own control
    // in the same response.** The global `$typedFetch` already works verbatim inside a
    // Nitro handler (the test above runs it), so context forwarding is the only
    // thing this member adds — and the probe makes both calls to the same
    // callee, in the same request, so the difference is measured rather than
    // inferred.
    const body = await $fetch<{
      context: string
      global: string
      declared: string
      undeclared: string
      headers: string
    }>('/api/event-typed-fetch-probe', {
      headers: { cookie: 'probe=chocolate', 'x-probe': 'kept' },
    })

    // **One `toEqual` over the whole body on purpose.** Every mutation below
    // moves more than one field, and a chain of separate `expect`s would stop
    // at the first and hide the rest.
    //
    // Measured against a real built server, one mutation per row:
    //
    // | mutation | `context` | `headers` |
    // | --- | --- | --- |
    // | shipped | `chocolate/kept/application/json/ran/from-outer` | `application/json/from-caller` |
    // | the plugin wraps `globalThis.$fetch` | `none/none/application/json/ran/none` | unchanged |
    // | the merged `Headers` handed on **unflattened** | `chocolate/kept/none/ran/from-outer` | `none/kept` |
    // | a naive `{ accept, ...init.headers }` spread | unchanged | `application/json/kept` |
    // | `accept` not set at all | `chocolate/kept/none/ran/from-outer` | `none/from-caller` |
    // | the `addServerPlugin` registration removed | 500 — `event.$typedFetch` is not a function |
    //
    // Row 2 is the ticket's whole claim, and it is the one that says this
    // member earns its place: wrapping the global instead of the event leaves
    // every *type* identical and silently drops the request's identity.
    expect(body).toEqual({
      // cookie / header / accept / middleware / platform.
      //
      // Three of the five differ from the global's answer and two do not, which
      // is what makes this a measurement of *forwarding* rather than of "the
      // wrapper works". `accept` matches because this module sets it on both
      // surfaces, and `middleware` matches because both are a
      // **full app pass** — h3 runs the internal request through Nitro's own
      // node listener, so middleware, the router and the error handler all run
      // and the body is the same serialized body a real client would get. That
      // is why this member needs no second wire format and no normalisation:
      // there is no path on which a declared failure arrives as an unserialized
      // thrown object.
      context: 'chocolate/kept/application/json/ran/from-outer',

      // The same call one line later through the global, which forwards
      // nothing. This is the control, and it is what the line above renders
      // when the plugin wraps `globalThis.$fetch` instead of `event.$fetch`.
      global: 'none/none/application/json/ran/none',

      // The callee's flat variant, narrowed exhaustively by a `shared/` helper
      // whose parameter is `DeclaredErrorsOf<'/api/users/:id'>` — the
      // blessed server-to-server shape.
      declared: 'user-suspended until 2026-12-31',

      // A hand-rolled 403 with `data` of its own and no marker: it threw, and
      // what it threw was not a declared failure.
      undeclared: 'threw undeclared',

      // **The event-bound merge, on the wire.** `/status` sits
      // outside `/api/**`, which is the only place `accept` decides whether a
      // declared failure comes back as JSON at all, and it echoes back the two
      // headers it received. `from-caller` rather than `kept` is the discriminator:
      // the incoming request carries `x-probe: kept`, h3 forwards it, and this
      // call's own `Headers` is spread over it — so this string says the
      // caller's header survived the merge **and** won, which the *correct*
      // global merge one file over would break both halves of.
      headers: 'application/json/from-caller',
    })
  })

  it('keep the chain linear over three hops', async () => {
    // A→B→C, each hop through `event.$typedFetch`, with the outermost request's
    // cookie read off the **deepest** handler's own event and carried back up
    // in the payloads. So this one line covers depth, context forwarding across
    // two nested internal calls, and the success path.
    const ok = await $fetch<{ hop: string; from: string; cookie: string }>(
      '/api/chain/a?mode=ok',
      { headers: { cookie: 'probe=chocolate' } }
    )

    expect(ok).toEqual({ hop: 'a', from: 'b', cookie: 'chocolate' })

    // The remap shape — the one the module blesses. C fails, B raises its own
    // `b-upstream`, A raises its own `a-failed`. **Non-accumulating**: what
    // reaches the client is A's variant, and the payload records the path it
    // came by rather than the callee's tag arriving unannounced.
    const remapped = await chainRejection('/api/chain/a?mode=remap')

    expect(declaredError(remapped)).toEqual({
      tag: 'a-failed',
      status: 500,
      hop: 'b:remap',
      cookie: 'chocolate',
    })

    // The verbatim-forwarding shape, which needs no API: B imported the same
    // catalogue and declared `c-gone` in its own `errors: [...]`, which is what
    // makes forwarding an explicit act of publication. A still remaps, so the
    // client still sees only A's union — the expect-error directive in
    // `playground/server/api/chain/a.get.ts` is the compile-time half of that,
    // spelled out here rather than quoted.
    const forwarded = await chainRejection('/api/chain/a?mode=forward')

    expect(declaredError(forwarded)).toEqual({
      tag: 'a-failed',
      status: 500,
      hop: 'c:forward',
      cookie: 'chocolate',
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
      // failure caught in a `catch` — the third context the value form
      // sits on the side-agnostic specifier for, and the one no
      // client-side call site can stand in for now that `/shared` carries a
      // `vue` import.
      caught: 'user-suspended',
    })
  })
})

/**
 * The rejected value of a call into the chain, as the client receives it.
 *
 * Named for the chain rather than for fetching in general, because it is not a
 * neutral helper: it **always sends the probe cookie**, which is the whole
 * point of calling it — the value travels two hops down, is read off the
 * deepest handler's own event, and comes back out in the payload. A caller who
 * wanted a rejection without that would be reaching for the wrong function.
 *
 * `any` for the reason `test/e2e/wire.test.ts`'s twin gives: the point is what
 * arrives at a caller, so nothing here may lean on the shape it is checking.
 */
async function chainRejection(path: string): Promise<any> {
  return $fetch(path, { headers: { cookie: 'probe=chocolate' } }).then(
    () => undefined,
    (thrown: unknown) => thrown
  )
}
