# Internals analysis — what the old package's insides are worth

Working document for roadmap step 6. Not part of DESIGN.md yet: this is the
inventory of `nuxt-handler-errors`'s internals (emitter, module wiring, wire,
runtime) with a take / adapt / drop verdict per piece, plus the gaps the old
package never closed. Once discussed, the settled parts fold into DESIGN.md
and this file dies.

Sources: the old `packages/nuxt-handler-errors/src/**`, its README limitations,
and `.scratch/asdsad/.scratch/keep/open-questions.md` (the three questions the
old version consciously left open).

---

## 1. The emitter (`emit-map.ts`) — TAKE, nearly whole

The strongest file in the old package. Every hard-won invariant is independent
of the surface redesign:

- **Pure `(handlers, options) => string`**, never logic inlined in `setup()`.
  Testable with no Nuxt booted. Keep the shape exactly.
- **Derived from handler *paths*, never catalogue content** — the map says
  `typeof import('<handler>').default` and lets the compiler resolve it, so
  nothing goes stale and no watcher is needed. This survives the glue redesign
  untouched: the extractor it calls changes name, not the mechanism.
- **`types/` placement is load-bearing** — an unresolved `import('…')` in a
  `.d.ts` produces *no diagnostic*; the entry silently becomes the error type.
  The landmine and its documentation both carry over.
- **The loop is Nitro's route-types loop re-run**, with the three recorded
  divergences (lowercased method keys, sorted output, `./`-forced specifiers).
  Keep all three and their reasons.
- Mechanical hardening, all keep: `Map` not object (`__proto__` is a legal
  directory name), string-literal escaping, codepoint sort (not locale),
  `EMPTY_MAP` as the same shell applied to no routes, `TYPES_SPECIFIER`
  exported so the `typescript.hoist` push cannot drift.

**What changes:**

- The extractor. Old: `ExtractErrorsSafe<typeof handler>` with
  `Serialize<unknown> → never` closing the index-signature door. New: the
  emitter reads the `__knownErrors__` brand through the sandbox's guarded
  `KnownErrorsOfHandler` (unbranded → `never`, `any` → `never`, measured in
  §6 of DESIGN.md). Still wrapped in `Simplify<Serialize<…>>` — serialization
  is a property of the wire either way, and the `Serialize<unknown> = never`
  belt is worth keeping even if the new guard already lands on `never`.
- Names: `TypedApiErrors` → `KnownApiErrors`; the emitted header comment; the
  specifier stays `@dphonys/nuxt-handler-errors/types` because the package
  takes back the old identity (naming pass, §2).

## 2. Module wiring (`module.ts`) — TAKE the schedule and the splits

- **The `nitro:init` → `types:extend` → `updateTemplates` schedule** is the
  correctness anchor: `types:extend` fires inside Nitro's `writeTypes` after a
  fresh `scanHandlers`, so the map lands a beat ahead of Nitro's own route
  types. Nothing else has that schedule. Take verbatim, including capturing
  the `Nitro` instance from the hook rather than `useNitro()` at render time
  (dev-restart instance identity).
- **`addTypeTemplate` with `{ nitro: true, nuxt: true, shared: true }`** —
  measured: naming any context opts out of the rest. Take.
- **The plugin split** — client-only app plugin + Nitro plugin for the global,
  a *separate* Nitro plugin for the event surface — exists so each is
  deletable with a mutation that reddens only its own tests. Take the split
  and the reasoning.
- **`optimization.keyedComposables` registration** — take, and extend: the new
  surface registers four names (`useCheckedFetch`, `useLazyCheckedFetch`,
  `useCheckedAsyncData`, `useLazyCheckedAsyncData`), the asyncData pair with
  vanilla's own `argumentLength`.
- **The custom `nitro.errorHandler` warning** — take. Declared failures still
  ride `error.data` on the default serializer; a handler that drops `data`
  still silently kills the package. (Whether v1 wants a runtime smoke-check
  on top is a possible new requirement — see §8.)
- **`ModuleOptions = {}`** — the "an option is far cheaper to add than to
  remove" stance held up. Keep empty *unless* the observability decision (§6)
  forces one; my recommendation there needs none.
- Compatibility ceiling as the only guard against the h3 v2 / Nitro 3 line —
  take, re-measure the floor.

## 3. The wire (`wire.ts` + the raise in `errors.ts`) — TAKE with one locked fix

- **One reserved key, versioned by rename** — take; already renamed
  `__knownError__`. Frozen, package-name-free, presence-is-evidence.
- **`{ ...fields, tag, status }` — reserved names spread last** so a payload
  field cannot displace the floor. Take.
- **`fatal`/`unhandled` left untouched** so Nuxt never escalates a declared
  failure to the error page, and the prod serializer keeps `data`. Take —
  this is the free half of the observability story.
- **DROP: `statusMessage: tag`.** The old package's documented reason-phrase
  leak was its own wire's fault (measured, DESIGN.md §5). Already a standing
  constraint made structural by `KnownRaiseInput` (`statusMessage?: never`).
  `message: tag` may stay — the prod handler scrubs it on any escape, so it
  only reaches the route's own client, which knows the tag already.
- **The floor read (`readFloor`)** — take as the matcher's internal guard:
  `typeof`-checked `tag: string` + `status: number`, malformed marker reads as
  *unknown* (the direction every consumer handles). One nuance to carry into
  the implementation: **the marker sits at two depths.** On a fetched carrier
  it is `error.data.data.__knownError__` (body → h3 data); at the raise site,
  on the server's own thrown `H3Error`, it is `error.data.__knownError__`.
  The old reader only ever handled the fetched shape; a server-side
  recognizer for integrations (§6) must handle both.

## 4. The raise path and catalogue runtime (`errors.ts`) — ADAPT: ideas, not code

The catalogue container is gone (variants as values, DESIGN.md §2/§4), so the
implementation is new, but four ideas transfer:

- **A runtime brand the module instance owns, checked loud and early.** The
  old module-private `INTERNALS` symbol + `raiseForeignCatalogue` caught the
  two-copies-in-the-tree state at *module evaluation*, not on whichever
  request first raised — and deliberately avoided `Symbol.for()` because
  quietly-interoperating copies would conceal the h3-augmentation breakage a
  second copy also causes. The sandbox already concluded the brand on values
  must be runtime-real (§6: an optional phantom on a value is a weak type).
  Same mechanism, new unit: `defineError` attaches the module-private marker
  to each `KnownError` value; `defineCheckedEventHandler` verifies every
  element of `errors: [...]` at declaration and throws the foreign-copy error
  naming the index. Take the error message's diagnosis text too — it was
  good.
- **Resolution at declaration, not lazily inside `fail`** — misconfiguration
  fires when the route is defined, not when a request happens to hit the bad
  tag. Take.
- **Unknown tag → plain `Error`, never a marked one** — a programming mistake
  must not arrive at a client wearing the marker. Take. (Smaller surface now:
  the compile-time tag check is stronger, but JS callers still exist.)
- **First-wins tag resolution** is superseded: `ConflictGuard` makes divergent
  duplicates a compile error and identical duplicates collapse in the union —
  but JS callers see no guard, so the runtime still needs a rule. That rule
  is already standing (§2): **one error per distinct tag in `pick()` and in
  the handler's resolved list** — dedupe at build-the-list time, first
  occurrence wins, which makes the old composition-order question moot at
  raise time.

## 5. The fetch runtime — TAKE the measurements, rewrite the semantics

The three header merges and their *deliberate unsharing* are the most
expensive-to-rediscover knowledge in the package. All measured, all keep:

- **`accept: application/json` on every request** — without it Nitro's
  `isJsonRequest` path-test fails outside `/api/**` and under a non-root
  `baseURL`, and a declared 403 arrives as HTML. (Re-verified in DESIGN.md §5
  including why ofetch never rescues it.)
- **Global form:** merge through `Headers`, hand on *as* `Headers` (ofetch's
  `mergeHeaders` takes one correctly); instance-defaults check mirrors
  ofetch's shallow defaults spread (`nextInstanceHeaders`).
- **Event-bound form:** merge through `Headers`, then **flatten to a plain
  object** — h3's `fetchWithEvent` merges by object spread, where a `Headers`
  instance spreads to nothing.
- **Composable form:** ref-unwrapping `resolveHeadersInit` at every level
  (or `ref('Bearer …')` stringifies to `[object Object]`), returned as a
  `computed` so vanilla's deep watch still tracks `headers: someRef`.

Also keep:

- **`globalThis.$fetch` read at call time**, so the two installing plugins are
  one assignment each and no ordering problem exists.
- **`create` returns the typed interface**; instance-header semantics as
  above. (`raw` passthrough indexed out of Nitro's declaration; `.native`
  passed through — both already settled in §2.)
- **The event plugin's `request`-hook placement** (fifth closure beside
  Nitro's own four, earliest point `event.$fetch` exists) and the
  **thunk + first-call `EventFetchUnavailableError` guard** naming the
  `@experimental` skew. DESIGN.md §5 already says the guard "stays right".
- **One shared normalize function used by both surfaces** — the old
  `toTypedResult` was shared between global and event wrappers precisely so
  the false-arm rule could not drift. Same argument applies to `.try`.

What changes (all already locked in §2, listed here only as implementation
deltas from the old code):

- `toTypedResult`'s **rethrow-unknown semantics die**. `.try` catches
  everything and normalizes to `NuxtError` — the carrier, not a flat variant.
- **Standing requirement lands here:** server-side normalization must
  populate `status` on the carrier (a bare `H3Error` sets only `statusCode`).
- The five-overload `useFetch` mirror gets rebuilt for `useCheckedFetch` with
  the error slot deleted; the old file's reasons for all five overloads and
  for the interface form (overload count off the hover) still apply.
- New runtime with no old counterpart: `useCheckedAsyncData`'s
  unwrap-or-rethrow (measured safe: h3 `createError` short-circuits on its
  own errors), `useRequestCheckedFetch` (three-line mirror of vanilla's), and
  `matchError` itself (floor read + arm dispatch + fallback; trivially small,
  and the *only* read path — `useDeclaredError`/`declaredError` have no
  successor by design).

## 6. Gap: observability — open question 1, the one real hole

The old package's known limitation: **Nitro's `captureError` fires the `error`
hook unconditionally**, so a Sentry-style integration reports every declared
404/403 as an error. The old package did nothing but document it.

The two halves genuinely differ, and I think that's the answer, not a
complication:

- **A route's own declared failure** (`fail('user-not-found')`, answered by
  the caller's matcher) is not an incident. Reporting it is noise that trains
  people to ignore Sentry.
- **A callee's declared failure escaping a caller** is `unhandled = true` —
  a genuine caller bug, wearing the wrong status line (measured, §5). That
  *should* be reported; suppressing it would hide the exact defect `.try` +
  translation arms exist to prevent.

What the module can actually do, mechanically: the `error` hook is hookable's
parallel fan-out — one subscriber cannot cancel the others, so **the module
cannot generically suppress anything**. (Worth re-verifying against the
installed Nitro before treating as fact, but I found no cancellation channel.)
That narrows the design space to:

1. **Do nothing, document** — the old answer. Weakest.
2. **Export a server-side recognizer** — a small function over the wire floor
   (`knownError(error)` or similar; naming TBD, it must not resurrect the
   rejected client-side guard) that answers the variant or `undefined`, plus
   a documented recipe: filter in Sentry's `beforeSend` / the consumer's own
   `error` hook, keyed on the recognizer **and** `unhandled === false` — so
   the noisy half is filterable and the escaped half still reports. Handles
   both marker depths (§3). Zero options, zero behavior change, composes
   with any APM, and the unhandled distinction is the *integration's* choice.
3. **Ship a first-party hook that tags** `event.context` or the error object
   so integrations can read a boolean instead of the wire. More surface for
   the same information; only worth it if (2) proves awkward in a real app.

**Recommendation: (2).** It is the only shape that respects both halves of
the question having different answers, and it keeps `ModuleOptions` empty.

## 7. Gap: the other two open questions

- **Foreign wire marker on the degraded reader (Q2).** The typed channel
  already refuses foreign markers for free (external URL → union resolves to
  `never`). What remains is the degraded matcher honoring a forged marker
  from an arbitrary external URL. The old reasoning — a forged marker is no
  worse than a forged success payload — still holds, and the degraded
  fallback types it as the floor only (`{ tag: string; status: number }`), so
  the blast radius is a string and a number the caller already treats as
  untrusted. **Recommendation: accept and document for v1.** A same-origin
  runtime check would need the request URL off the error (`FetchError` has
  it, plain errors don't), buys little, and can be added compatibly later.
- **Opt-in catalogue-driven skew-safe match (Q3).** The `unrecognized`
  fallback parameter already handles skew *honestly*, which was the actual
  unsoundness. Exact recovery via a runtime tag list is real but wants real
  app code to judge. **Recommendation: explicitly out of v1**, recorded as
  future work, not designed now.

## 8. Gaps the open-questions file didn't name

Candidates noticed while reading; none blocking, listed for the discussion:

- **A dev-time wire smoke check.** The custom-`errorHandler` warning fires on
  the override's *presence*, but a handler that keeps `data` is fine and one
  that drops it is fatal — setup cannot see which. A dev-only self-request
  that raises a known error and checks the marker survives the round trip
  would convert "warning you learn to ignore" into "red the first `nuxi dev`".
  Possibly overkill; possibly the cheapest insurance in the package.
- **DevTools / generated-docs surface** — the old file deleted these as
  "untouched and unmissed". Agree; stay dead.
- **Test infrastructure as an internal worth taking:** the old package's
  type-test harness with pos/neg fixture programs, the mutation-visibility
  arguments baked into the plugin split, and the playground-measured facts
  now living in DESIGN.md §5. The harness approach should carry over even
  though every fixture is rewritten.

---

## Standing requirements already locked elsewhere (collected, not new)

For step 6's checklist, the requirements DESIGN.md has already banked:

1. The tag must not ride `statusMessage` (`KnownRaiseInput`, structural).
2. `pick()` and the handler's resolved errors list hold one error per
   distinct tag, enforced at runtime.
3. Server-side `.try` normalization populates `status` on the carrier.
4. The brand on values is runtime-real (marker or cast); the brand on the
   handler stays an optional phantom with the guarded extractor as the single
   reader.
5. `useCheckedAsyncData` runtime is exactly unwrap-or-rethrow.
6. `useCheckedAsyncData` + lazy twin registered in `keyedComposables`.
7. `event.$checkedFetch` is the seam exactly — call plus `.try`, nothing
   typed that is not assigned.
