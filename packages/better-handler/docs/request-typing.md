# Request typing

A call site of a route is typed for what it may send (`body`, `query`, `headers`), what it receives, and how it can fail. This note says why the types read what they read, and why two mechanisms carry them.

## Why the input types

A call site sends what a schema accepts, not what it produces. A query declared `z.string().transform(Number)` is a `string` on the URL and a `number` in the handler; typing the call site with the output type would ask the caller for a number it cannot put in a URL. So request typing reads each declared schema's **input** type, and a tuple's inputs intersected, while the Handler context and the response read **output** types.

The client stays schema-library-free: nothing about a schema runs on the client, and the call site is typed at compile time only.

## Why a generated map

Nitro's own fetch types know each route's response but nothing about what it accepts: before Nuxt 4.6, nothing typed `body` or `query` at all. The package therefore generates one file, `.nuxt/types/better-handler.d.ts`, that reopens two interfaces of `@dphonys/better-handler/types`, keyed by route and lowercased method:

- `KnownApiErrors`, each route's Known errors;
- `KnownApiRequestInputs`, each route's Request input.

Each value reads a brand off the handler type, `typeof import('<route file>').default`, under a module-private `unique symbol`, so a handler from anywhere else cannot spoof it and reads as "not ours", which keeps vanilla typing. A route the compiler cannot resolve (a JavaScript route a module ships, Nuxt's own renderer) declares nothing.

The map augments only the package's own `/types`. Nothing is hoisted: `typescript.hoist` at Nuxt 4.0.3 points every generated tsconfig at the package root, while the package's `exports` resolves the subpath correctly on 4.0 and on 4.6. The old composing package had to write tsconfig `paths` because its map augmented another package's specifier; with one package there is nothing to bridge.

## The family's contract

Every member of the family takes the same call signature, `<T, R, const M>(request: R, opts?: BetterRequestOptions<R, M>)`: the method is inferred from `opts.method`, and the options are a concrete type computed from the route and method. This is Nuxt's own `useFetch` pattern, chosen over inferring the whole options object as a type parameter:

- **An inferred options type cannot reject excess keys**, because TypeScript's excess-property check never fires through a type parameter, and it breaks calls that pass no options.
- **A concrete options type gets required sources and excess-key refusal natively**, with TypeScript's own messages at the offending key.

The rules that follow from it:

- A declared source is required unless `{}` fits its input type, so an all-optional schema stays optional but typed.
- A declared `body` replaces vanilla's union, so no `FormData` or string side door remains where the schema describes an object.
- Declared headers type the keys they name and leave the rest open: a client sends more headers than any route validates.
- A route of this package takes no `body` on `get` or `head`. A route the map does not type keeps vanilla's options key for key, `body` on `get` included, so adopting the package is incremental and a route never types worse than vanilla.
- ofetch's deprecated `params` alias of `query` is gone from the whole family, since it is a back door past the query's checks.
- The method is accepted in either case, `get` by default when the route has one; every lookup lowercases it.

**Known limits, accepted.** A call with no options at all skips the requiredness check, because `opts` itself is optional. A source passed through a `ref()` or a getter on the composables loses the excess-key check, because the option is a union of reactive forms and `ref()` infers its own type; the values are still checked. `$betterFetch<T, R, M>` is not type-argument-compatible with `$fetch<T, R, O>`.

## Stack depth, and the route ceiling

Per-route fetch types instantiate Nitro's route matching for every call, and careless shapes report `TS2321` (excessive stack depth) per route. The types follow four rules, each one a `TS2321` when broken:

1. the method parameter's default references only the request;
2. anything that derives a method from the options lives in an alias default, never in a signature parameter's constraint;
3. the route lookup runs at most once per map lookup;
4. no type parameter appears in its own constraint.

Nitro's own route matching has a ceiling the rules cannot lift. Measured on a real Nuxt app, every call statement on Nitro's `InternalApi` engine passes TypeScript's per-statement instantiation cap somewhere between 176 and 201 routes and reports `TS2589`, and vanilla `$fetch` does the same on that engine with no package code involved. Nuxt 4.6's generated route engine costs a fraction of that, so the ceiling lifts when the Nuxt 5 adapter moves the response-typing seam onto it. Until then it is accepted and documented; there is no version-conditional typing.

## Why the native slot

Nuxt 4.6 ships its own typed `$fetch`, opt-in through `experimental.routeTypedFetch` and the default in Nuxt 5. Its extractor reads a handler's request types off the `H3Event<Request>` generic of the handler's default export. A handler that leaves that generic at h3's default makes vanilla `$fetch` see `never` for body and query once the flag is on, so this package, left alone, would make native typing worse on its own routes.

The handler `defineBetterEventHandler` returns therefore fills the slot: `EventHandler<{ body, query }, Response>`, each key present only when declared, each the schemas' **input** type, for the same reason as the family. The module never reads or sets the flag; an app that turns it on gets correct native typing on these routes, and one that does not sees nothing change.

The handler's own `event` stays h3's default. The slot describes what a client sends; claiming it on the handler's `event` would type `readBody(event)` as validated when it is not.

The query is restated key for key before it fills the slot, for two reasons found while prototyping. h3's slot constraint requires a query concretely assignable to a record of query values, and an interface-typed input has no implicit index signature until restated. And a value no query can carry (`unknown` from every `z.coerce`, a `bigint`) is widened to any query value, because otherwise Nuxt's extractor reads the whole route as `never` without reporting anything. A query that is no record is `never`, as Nuxt would answer anyway, so it cannot take the body down with it.

## Why both mechanisms

The native slot cannot replace the generated map, and the map cannot replace the slot:

- **The map works on every Nuxt 4**, from 4.0.0; the native engine exists from 4.6 and only with the flag on.
- **The map is the only home of the error union.** Nuxt's per-route error slot is never filled or consumed by Nuxt today, so the slot is left alone and Known errors are typed only through the family.
- **The map types what Nuxt's extractor cannot**: array and primitive bodies and queries (Nuxt reads records only), two handlers on one route and method (Nuxt types neither), a body admitting `undefined` (Nuxt drops it), a body union of records and non-records (Nuxt keeps the records), and declared headers (Nitro carries body and query only).
- **The slot types what the map cannot**: vanilla `$fetch` and `useFetch`, which an app keeps using alongside the family.

The package's suite asserts that the two agree on body and query wherever both can be exact, and pins each known difference. The map is never made less precise to match Nuxt.
