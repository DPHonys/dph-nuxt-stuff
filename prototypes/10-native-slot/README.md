# PROTOTYPE - throwaway. Ticket 10 (DPH-14): the native slot and Nuxt 4.6's generated engine

Branch `prototype/10-native-slot-and-generated-engine`, never merged. Nothing
here is production code; the findings live on the ticket.

## Layout

- `lib/` - the better-handler types in shipped form (`.d.ts`, as
  nuxt-module-builder emits them, so `skipLibCheck` treats them as a consumer's
  compiler does), plus a throwaway `.js` runtime so the apps can be prepared.
  - `handler.d.ts` - `defineBetterEventHandler`, `BetterEventHandler`, the
    native slot `NativeRequest<S>`, the three phantom brands and their readers.
  - `engine.d.ts` - the response-typing seam: the only `nitropack/types` importer.
  - `request-typing.d.ts` - `KnownApiRequestInputs`, `KnownApiErrors`,
    variant C (`BetterRequestOptions`, `$BetterFetch`), the exhaustive `.try`.
  - `composables.d.ts` - `useBetterFetch`.
- `module/better-map.ts` - the generated map: Nitro's scanned handlers
  re-emitted on `types:extend`, both slots, one template.
- `fixture/` - a Nuxt app with 26 routes (27 handlers), prepared twice:
  `.nuxt-on` (`experimental.routeTypedFetch: true`) and `.nuxt-off`.
  - `checks/both/agreement.spec-d.ts` - question 2, the two-mechanism agreement.
  - `checks/both/slot.spec-d.ts` - question 1.
  - `checks/both/response.spec-d.ts`, `checks/both/call-sites.ts` - questions 3 and 5.
  - `checks/on/native.ts`, `checks/off/native.ts` - vanilla `$fetch`/`useFetch`
    with the flag on, and the mirror with it off.
- `cost/` - the September 51-route program (`prototype/10-request-typing` at
  `b3f8348`) ported to the new design, as a Nuxt app; `scripts/cost.mjs`
  generates the synthetic routes and measures it at any route count.
- `scripts/` - `prepare.mjs`, `check.mjs` (everything but cost), `cost.mjs`,
  `order-check.mjs` (TS2321/TS2589 with each root file checked first),
  `lib-check.mjs`, `probe-types.mjs`.

## Run

```sh
pnpm --filter @dphonys/prototype-10-native-slot proto:prepare
pnpm --filter @dphonys/prototype-10-native-slot proto:check
pnpm --filter @dphonys/prototype-10-native-slot proto:cost        # 51 and 201 routes
pnpm --filter @dphonys/prototype-10-native-slot proto:cost 45 170 # any GEN counts
```
