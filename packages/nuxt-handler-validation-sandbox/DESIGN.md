# nuxt-handler-validation, iteration two — public surface design

This package is a **types-only sandbox**. It contains the whole public surface
of the next iteration as compilable TypeScript (`declare function` + real
types), usage files that prove the ergonomics, and misuse files that prove the
diagnostics — and no implementation. Once this surface is locked, the
implementation phase starts in the real package.

```sh
pnpm --filter @dphonys/nuxt-handler-validation-sandbox typecheck
```

The goal, unchanged from v1: **define the schemas, validate the request,
provide the values to the handler.** The standard to follow is the sibling
package (`nuxt-handler-errors`) — its conventions, not a 1:1 copy.

## The diagnosis of v1

v1's runtime goal was simple, but its composition layer was not: to reuse a
schema set across routes you learned a vocabulary of **sets, fragments,
groups and names**, a definer (`defineValidation`) with two arities, a
group-as-readonly-tuple trick whose only purpose was to make object-spread
fail, five distinct collision "poisons" that fire lazily on property access,
and an overloaded wrapper whose rejections collapse into
`TS2769: No overload matches this call` paragraphs. `composition.ts` alone was
255 lines of type machinery.

In design terms: the composition module was **shallow** — its interface (the
rules a user must know) was nearly as complex as its implementation. And it
fails the deletion test, because the problem it solves is smaller than it
assumed: validation has only **four fixed slots**, so the natural unit of
reuse is not a multi-source, optionally-named schema set. It is **a schema
for one source** — and a Standard Schema is already a value that travels as a
plain export, needs no definer, and contains no source keys to misspell.

## The new model

One sentence: **a source slot takes a schema, or a tuple of schemas; reuse is
exporting schema values; composition is writing a tuple.**

```ts
// server/validation/listing.ts — reusable units are plain schema values.
export const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})
export const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })

// server/api/users/index.get.ts
export default defineValidatedEventHandler(
  { validate: { query: [pagination, sorting], body: profileBody } },
  async (event, { query, body }) => {
    // query: { page: number, size: number } & { sort: 'asc' | 'desc' }
    return listUsers(query, body)
  }
)
```

- **The options argument nests schemas under `validate`** — the sibling's
  `{ errors: [...] }` shape, and h3 v2's own key for exactly this concern.
  It also leaves a named slot free for a future combined wrapper with the
  sibling (`{ validate, errors }`).
- **Each tuple element parses the whole raw source, in order**; the delivered
  value is the merge of their outputs. The wire is untouched — the client
  still sends a flat `?page=1&size=20&sort=asc`.
- **Cross-library composition is free**: tuple elements are independent
  Standard Schemas, so zod and valibot mix inside one tuple.
- **A set spanning several sources is just an object of schema values**
  (`auth.headers`, `auth.query`), and the route says which slot each fills.
  Explicit, no machinery — see `src/sandbox/reuse.ts`.

### Composition rules — two, both at the declaration site

Composition (a tuple of two or more) has exactly two compile-time rules:

1. every composed schema's output must be an **object** — not a primitive, an
   array or a function; the test is structural, so interface-typed outputs
   qualify — and
2. their output keys must be **pairwise disjoint** — an intersection would
   lie about which value survives, so the overlap is refused; the escape is
   merging at the schema-library level (`.extend`, `v.intersect`, …).

Both report **at the offending source key, at the declaration**, each with
its own sentence (see `src/internal.ts`), and a stray key beside valid ones
errors at its own key with a sentence naming the four sources. There are no
lazy poisons, because with composition scoped to one source in one place, the
mistake site and the error site are the same place. A lone schema (bare or
`[x]`) has nothing to merge, so its output may be anything — primitives and
unions included, and a union stays a union (`src/sandbox/basic.ts`).

### The deletion ledger

| v1                                                         | now                                             |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `defineValidation`, sets/fragments/groups/names vocabulary | gone — reuse is exporting a schema value        |
| group-as-tuple + object-spread teaching error              | gone — nothing to spread                        |
| five collision poisons, firing lazily on property access   | two rules, firing eagerly at the declaration    |
| named-set output nesting (`query.pagination.page`)         | gone — merges are flat                          |
| overloaded wrapper, `TS2769` paragraph diagnostics         | one signature; errors land at the offending key |
| `composition.ts` (255 lines) + `guard.ts`                  | `internal.ts` (~80 lines)                       |
| phantom `__validatedSchemas__` + `SchemasOfHandler`        | dropped until something consumes it (see below) |

## What is carried over from v1 unchanged

These parts of v1 were right and are kept verbatim — the sandbox restates
their types; their documented runtime semantics transfer as-is:

- **The wire shape.** `400`, `statusMessage: "Validation Error"`,
  `data.issues: [{ source, message, path }]` — no options, identical in dev
  and prod, projection-as-sanitization. `ValidationIssue` and
  `ValidationErrorData` are unchanged.
- **Fail-fast source order** `routerParams -> query -> headers -> body`, and
  everything documented about what each source receives (h3's raw shapes,
  bodyless methods validating `undefined`, unreadable body becoming one
  `source: "body"` issue).
- **`recognizeValidationError`** — same symbol-marker contract, same
  "only a 400 is marked" rule, pairs with the sibling's predicate in one hook.
- **Module posture.** Zero options; `handlerValidation: false` as the real
  off-switch; a stray config key is a compile error.
- **The second parameter is the validated door**, sources are read once, and
  undeclared sources are **absent** — reading one is a compile error naming
  the key.
- **Any Standard Schema works, async included** — the wrapper awaits; the
  contract is only the `~standard` interface.
- **Auto-import doors.** Wrapper and predicate auto-imported inside
  `server/`; `/server` is the explicit runtime door, `/types` the type-only
  door for app code.
- The sibling's **no-default-`Response`** rule: an explicit type argument is
  an arity error, never a silent `any`.

## The public surface

Runtime, from `/server`, both auto-imported inside `server/`:

| Export                                          | Role                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `defineValidatedEventHandler({ validate }, fn)` | The wrapper. One signature. Returns a plain h3 `EventHandler`.       |
| `recognizeValidationError(error)`               | Observability predicate. Returns `ValidationErrorData \| undefined`. |

Types, from `/types` — type-only, safe from app code: `ValidationSchemas`,
`SourceSchemas`, `ValidationSource`, `ValidatedContext<S>`, `SourceValue<T>`,
`MergedOutput<T>`, `OutputOf<S>`, `ValidationIssue`, `ValidationErrorData`.

Two names gone from v1's list: `ValidationFragment`/`ValidationGroup` (no
composition vocabulary to name) and `SchemasOfHandler`/`ValidatedEventHandler`
(no phantom to read).

## Alternatives considered (design-it-twice)

- **(a) No composition at all** — one schema per source, period; all merging
  happens in the schema library. Smallest possible surface, but it silently
  gives up the cross-library case and makes "pagination + sorting" — the
  single most common reuse — library-specific ceremony at every route.
- **(b) v1's fragment arrays, minus names** — keeps `defineValidation` and
  whole-declaration composition. Still needs the group/tuple trick, still
  merges across an unbounded value, still reports far from the mistake.
- **(c) Per-source tuples — chosen.** All of (a)'s simplicity at the wrapper
  (one signature, no definer) plus the composition (b) exists for, with the
  merge rules scoped to the one place they apply. The tuple constraint (not
  `StandardSchemaV1[]`) is what keeps the merge typeable and rejects widened
  arrays at the constraint.

## Dropped capabilities, stated honestly

- **Named nesting is gone.** v1's `query.pagination` was _exactly_ the
  pagination schema's output, with no other set's keys riding along. The flat
  merge satisfies each part structurally — `helper(query)` still typechecks —
  but extra keys do ride along, and exact-type positions would see them.
  The claim "a route's shape does not change when another set joins" is
  weakened to "existing keys do not change".
- **Overlapping reuse requires a library-level merge.** v1's escape from an
  overlap was a name; the escape now is `.extend`/`v.intersect` or renaming a
  key. Composing the _same_ schema twice (`[pagination, pagination]`) is also
  refused as an overlap — in v1 spreading a set twice was tolerated.
- **The phantom seam is gone.** v1 carried `__validatedSchemas__` for a
  future aggregator. One adapter means a hypothetical seam; nothing consumes
  it today, so the wrapper returns a plain `EventHandler`. Reintroducing it
  later is additive and breaks nothing.

## Locked decisions

Formerly the open questions; each was decided explicitly, and the sandbox
implements every one.

1. **Overlap rule: refuse.** Two composed schemas producing the same output
   key is a compile error at the source key; the escape is a schema-library
   merge (`.extend`, `v.intersect`) or a rename. An intersection that lies
   about which value survives is worse than a refusal — and refusal can be
   relaxed to later-wins in a future minor, while the reverse breaks
   declarations.
2. **Stray keys carry a named sentence.** A misspelled key in `validate` is
   always a type error at that key (the guard restores fixed-key behaviour
   the generic inference would otherwise lose), and the locked promise is
   that the error's message contains this package's own sentence naming the
   four sources — not a bare `not assignable to never`. If the compiler's
   native "Did you mean" hint can also be coaxed out during implementation,
   it stacks as a bonus; it is not the contract (it cannot fire for a
   `validate` object passed as a variable at all).
3. **The object test is structural.** A composed schema's output qualifies
   for the merge if it is an object that is not an array or a function —
   `Record<string, unknown>` is deliberately not the test, because interfaces
   carry no implicit index signature and an interface-typed output
   (`z.custom<ThirdParty>()`) must not be falsely refused. Accepted cost: an
   exotic object output (`Date`, `Map`) passes the compile-time gate and is
   the runtime merge's to refuse.
4. **The wrapper stays `defineValidatedEventHandler`.** It mirrors today's
   vanilla `defineEventHandler` and the sibling's `defineCheckedEventHandler`.
   Taking h3 v2's `defineValidatedHandler` now would break sibling symmetry
   and squat on the exact name h3 v2 will auto-import the day Nuxt ships it —
   both packages rename together at that alignment point instead.
5. **A composed tuple runs every element, sequentially, in order — and
   aggregates.** An early element's failure does not stop the later ones:
   fail-fast stays a rule _across_ sources, and within one source every issue
   arrives together in the one `400`, so reordering a tuple never changes
   what a client sees. Sequential rather than parallel, so async schemas run
   deterministically.
6. **The runtime mirror of the compile rules** — for the callers the types
   cannot see (plain JS, an `any`-typed schema) and for runtime values the
   types cannot see (a passthrough key riding into an otherwise-disjoint
   merge):
   - an element output that is **not an object** at merge time is a `500`
     naming the source and the element position — a developer error, and
     deliberately **unmarked**, so `recognizeValidationError` never swallows
     it;
   - **overlapping keys merge later-wins, in tuple order** — the merge is a
     plain object spread, v1's documented rule for the same blind spot, at
     zero per-request cost. There is no per-request overlap detection; the
     compile-time rule is the guard for typed callers.

## File map

```text
src/types.ts          # the future /types entry — public, type-only
src/server.ts         # the future /server entry — declared, no bodies
src/internal.ts       # the declaration guard (replaces composition.ts + guard.ts)
src/sandbox/basic.ts  # everyday route, primitives, unions, response flow
src/sandbox/reuse.ts  # the reuse story: schema values, tuples, multi-source objects
src/sandbox/misuse.ts # what must not compile, and where each error lands
```
