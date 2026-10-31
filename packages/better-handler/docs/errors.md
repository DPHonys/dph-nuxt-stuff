# The error model

A route declares its expected failures as `errors: { [tag]: { status, schema? } }`, raises them with `fail(tag, fields)` or by throwing any value carrying a declared `_tag`, sends them as `data: { _tag, ...fields }`, and every call site reads them as a union exhaustive on `_tag`. This note says why each part looks the way it does.

## Checked failures

The goal is the checked-exception idea, made to work across HTTP: a route says what it can fail with, and the compiler makes each call site handle it. Adding a failure to a route breaks every `matchError` call over that route's failures, and the break is the point: the compiler is reporting that a new failure exists.

That only works if the failure a client reads is the failure the route declared, so the declaration, the raise and the wire are one shape.

## Why a map keyed by tag

The first design declared errors with a `defineError(tag, { status, payload })` call, collected them in groups that a route narrowed with a selection method, and raised them through one camelCase factory per tag on the Handler context (`errors.userNotFound(...)`). The October revision replaced all of it with a plain object keyed by tag:

- **A map is the declaration and the lookup at once.** The tag is the key, so a route's union is the map's keys, and nothing derives a factory name from a tag.
- **Reuse and narrowing are the language's own.** Reuse is object spread and narrowing is `Pick`, so there is no group type, no selection method and no conflict guard: two declarations of one tag are an ordinary later-key-wins merge. `defineError` survives only as sugar that checks one entry where it is written and returns a one-key map to spread.
- **The schema is the fields.** An entry's optional `schema` describes the fields beside `_tag`; there is no separate payload concept. A schema that also carries a `_tag` literal must agree with the key, which is what lets an Effect error class's own schema be the declaration.
- **Statuses are free.** A status is any integer from 400 to 599, and two tags may share one: the tag, not the status, says which failure it is.

## Why `_tag`

The first design discriminated on a kebab-case `tag` and enforced the case with a regex. `_tag` replaced it because it is the discriminant the TypeScript ecosystem already uses for tagged errors: Effect's tagged error classes carry `_tag` and encode to `{ _tag, ...fields }`, and `catchTag` matches on it. Using the same key means a value of another library is a Known error without conversion, and a Known error is a familiar shape to a client. Tags are any non-empty string literal; the package's own two are kebab-case by convention only.

Two tags are reserved for the package's own variants: `validation-failed`, which every route with `input` carries, and `request-failed`, the client's catch-all. Declaring either would make a declared failure indistinguishable from a built-in one, so both the compile guard and the declaration-time check refuse it on every route.

## Why one helper, and why it returns an `Error`

`fail(tag, fields)` pairs a tag with its fields at compile time the way `respond(status, value)` pairs a status with its body: one signature, the second argument a rest tuple that is empty for a schema-less tag. One signature rather than overloads keeps a wrong call reporting at the argument instead of collapsing into "no overload matches this call".

It returns rather than throws so that `throw fail(...)` reads as control flow at the call site and type narrowing after it works. What it returns is an `Error` subclass, so a throw has a stack trace that starts at the handler. The fields are defined as own enumerable properties rather than assigned, so a field named `message` or `stack` is a field and not the `Error`'s own property.

## Why any thrown value with a declared `_tag`

The boundary recognises a Known error by its `_tag` alone, whoever built it. That is what makes an Effect error class instance, thrown as-is, go out as declared, and it is also what lets an app's own error classes participate without wrapping. The status always comes from the declaration, so a thrown value can never choose its own status.

A value whose `_tag` the route does not declare propagates untouched in production: a `_tag` is not only ours, and Effect's own failures carry one. On a development server it is refused, because the likeliest cause is a typo or a tag declared on another route, and production would otherwise turn it into an unrecognised `500` nobody notices.

## Why one body for every caller

The first design sent the typed failure only to callers that presented a build-time token in a header; a Nitro error handler stripped it for everyone else. The October revision removed it. The token hid only the payload fields, never the tag; it was documented as not a security boundary; and it had no counterpart in any comparable system. It cost a module option, a header, an alias, an error handler and their tests, and made the wire depend on who asked.

Effect's `HttpApi`, oRPC, tRPC and ts-rest all send one body to every caller, and now so does this package. The consequence for app authors is stated plainly in the README: the fields that go out are every own enumerable property of the thrown value, so a route must hand `fail` only what a client may see.

## Why the wire is Nitro's ordinary error body

A Known error is an ordinary HTTP error: its status is the declared one, `message` is the tag, and `data` is the Tagged error, flat. There is no wrapper key and no copy of the status inside `data`. The first design nested a marker object under a reserved key and repeated the status in it; with one shape for every failure, the marker carried nothing a reader needed.

Keeping it in `data` also needs no seam for Nuxt 5: h3 v2's `HTTPError` keeps `data` nested, where `data.issues` is where h3 v2 itself puts validation issues. `statusMessage` is never set, because h3 copies it into a server-to-server fetch's error, so nothing of ours may ride the reason phrase.

## Why the client's union is exhaustive, and why `request-failed`

`.try` resolves to `{ data, error }`, and `error` is the route's declared variants plus one built-in, `request-failed`, carrying `status` (or `undefined` when no response arrived) and the `NuxtError` it came from. Everything that is not a declared failure (a network error, an abort, an undeclared status, a body that is not ours) is that one variant.

The first design typed `.try`'s error as a `NuxtError` carrying the marker and needed a separate fallback for "anything else". With `request-failed` in the union, a `switch` over `_tag` has no untyped hole and needs no `default`.

## Why `matchError` still takes a fallback

The union is exhaustive over what the types can see, and the types cannot see a tag the call site was never compiled against: a tab left open across a deploy that added a failure, or a hand-rolled `data._tag` from another server. The classifier hands such a body back as the Tagged error it is, so `matchError(error, arms, fallback)` requires a fallback, called with any error whose `_tag` has no arm. Required, so ignoring it is written out (`() => {}`) and greppable. `.try` keeps its exhaustive union; the fallback lives only where arms are dispatched by name.

## Why one recognizer, read at one depth

There is one shape, so there is one recognizer: `recognizeKnownError(error)` hands back the Tagged error or `undefined`, and validation is `_tag === 'validation-failed'`. It reads the error's own `data` only. A callee's Known error that a caller let escape carries the callee's whole body as its `data`, the tag one level further down, and is not recognised: it is the caller's bug, and an observability hook that skips expected failures must keep reporting it. The first design read both depths and needed an `unhandled === false` check beside it to tell the two apart; reading one depth makes the predicate a single call.

## Why the checks are development-only

Three things are checked only on a development server: a response against its declared `output`, a thrown Known error's fields against its schema, and a thrown `_tag` the route never declared. Production runs none of them and sends what the handler handed over.

- **Production should not pay for a mistake it cannot fix.** A schema run on every error or every response costs time on the hot path to find a bug that only a developer can act on.
- **A check must not change the bytes.** Each check is an assertion, never a transform: its result is discarded, so a development server sends exactly what production sends, and nothing works in development that breaks in production. The first design validated an error's payload at raise time in production and turned an invalid payload into an unmarked `500`; that made production behaviour depend on a schema the client never sees.
- **A refusal is a developer fault, never a Known error.** It is a plain `500` with no `data`, so it never carries a `_tag`, never widens a route's union with an arm production cannot produce, and keeps reporting in an observability hook.

The checks are on by default and share one flag, `devChecks`; an app whose responses or errors a schema cannot describe turns them off. The flag reaches the server only as the presence of a Nitro plugin that turns the checks off, so no value travels into the bundle.
