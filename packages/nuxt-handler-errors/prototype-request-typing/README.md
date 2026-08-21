# PROTOTYPE — throwaway. Request typing for the typed-fetch family (wayfinder ticket 10)

Question: does the request-typing contract from ticket 06 (variant C: `<T, R, const M>` +
concrete `TypedRequestOptions<R, M>`; declared source required iff `{} extends Input` is
false; `body` omitted on `get`/`head`; `params` omitted family-wide; whole `RequestInput<S>`
emitted with `Simplify` only) hold up in `tsc` against the real nitropack / h3 / nuxt types,
on a ~50-route map, with no `TS2321`?

Run: `pnpm tsc -p prototype-request-typing/tsconfig.json --extendedDiagnostics` from
`packages/nuxt-handler-errors`. Clean = contract holds; every wrong shape is pinned by a
`// @ts-expect-error` that would itself error if the rejection stopped firing.

Nothing here is production code. `lib/` is a types-only stand-in for the umbrella and the
validation parent's `/types` (ticket 04), `routes/` are fixture handlers, `generated/map.d.ts`
is what the generalised `emitMap` would write (hand-written + 45 synthetic routes from
`gen-map.mjs`), `fixtures/` are the call-site assertions.

## Result (2026-08-22, TS 5.9.3, nitropack 2.13.4, h3 1.15.11, nuxt 4.5.2)

`tsc` clean on the 51-route map: **every contract row holds**, no `TS2321`/`TS2589`.
~608k instantiations, ~8s wall (incl. program setup). Mutation check: switching declared
sources to optional lights up 5 `@ts-expect-error` fixtures, so the fixtures do bite.

Rows proven (fixtures/request-typing.ts): required body/query when declared; INPUT (pre-
transform) types; excess keys rejected (body, query, tuple-intersected query); `get` default;
method-keyed selection; uppercase method; all-optional schema optional but still key-checked;
`FormData`/string body rejected on declared routes; `default` handler declaring body compiles
with no body on `get` and requires it on `post`; template-literal routes; `params` gone family-
wide; `headers` vanilla; vanilla degradation for `defineEventHandler`, `errors`-only and
`routerParams`-only routes, external URLs and `Request` objects; key-for-key equality with
`NitroFetchOptions<R>` minus `params` (and minus `body` on `get`); `.try` union includes
`validation-failed`, `validate`-only routes typed, unbranded stays `NuxtError<unknown>`;
union-typed `method` distributes; two handlers on one (route, method) union; `create(defaults)`
keeps per-call requiredness; `.raw` shares the signature; explicit `T` override;
`useTypedFetch` with `ref`/getter/plain, typed data and error; bare `{}` and the reserved tag
rejected at declaration; handler context has `fail` iff `errors`, sources iff `validate`.

Findings to carry to the spec:

1. **Reactive sources weaken the excess-key check on `useTypedFetch`.** A plain literal body is
   still rejected, and a wrong *value* type through a getter is still caught, but an extra key
   inside `ref({...})` or a getter return is accepted — `ComputedOptions<T> | MaybeRefOrGetter<T>`
   is a union target and `ref()` infers its own type. Standard TypeScript; document, don't fight.
2. **`body` omitted on `get`/`head` is family-wide, unbranded routes included** (the rule as
   written). `$fetch('/api/plain', { body })` compiles today; `$typedFetch` rejects it. The
   key-for-key fixture is therefore "minus `params`, and minus `body` on `get`/`head`". Decide
   whether that is the intended reading (the prototype assumes yes).
3. **Pre-existing ceiling in the errors parent, not in the new types:** with a 201-route
   `InternalApi` the parent's `TryResultFor` alias (`types/fetch.ts:53`, the `O`-inferring
   `$checkedFetch.try`) reports `TS2589 excessively deep`, with *no* typed-fetch code in the
   program; at 150 routes it is fine. The variant-C `TypedFetchTry` compiled clean at 201
   (7.3M instantiations). Worth a note on the internals/test tickets: the umbrella's `.try`
   should not reuse the parent's `TryResultFor`, and the parent may want the same `const M`
   shape when it is next touched.
4. The generated map's `import('…')` specifiers are relative to the emitted file; a wrong path
   collapses silently to `any` under `skipLibCheck` (the first run of this prototype "passed"
   with every fixture accepted). The harness's refusal to render `any` is the right guard.
