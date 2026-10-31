# Input and output

The io half validates what a route reads and asserts what it answers. One sentence for the input model: **a source slot takes a schema or a tuple of schemas; reuse is exporting a schema value; composition is writing a tuple.**

## Why the Handler context is the only door

Each declared source is read once, before the handler body runs, and the handler receives the schema's output in its second parameter. Reading the request again inside the handler (`readBody(event)`) hands back h3's memoized, unvalidated parse, not what the schema produced. Keeping one door means nothing is parsed or checked twice and the handler never holds two versions of one value.

The context is flat: the validated sources, `respond` when the route has a status map, `fail` when it declares errors, and nothing else. A route's declarations decide its context, so an undeclared key is absent rather than `undefined`, and reaching for it is a compile error. The context is a fresh object per request, so a handler may decorate its own.

The handler's `event` stays h3's plain `H3Event`, even though the returned handler's type carries the declared body and query for Nuxt's typed fetch (see [Request typing](./request-typing.md)). The slot describes what a client sends; claiming it on the handler's own `event` would make `readBody(event)` lie.

## Why sources run in a fixed order and stop at the first failure

Sources are validated in the order `route`, `query`, `headers`, `body`, whatever order the declaration names them in, and the first source with issues answers. Cheap and synchronous first, stream-consuming last, so an invalid route param spares the body parse. There is no aggregate mode across sources. Within a source every issue is reported together, so a form with two bad fields needs one round trip, and a tuple's elements run one after another, so asynchronous schemas are deterministic.

Sources reach the schemas exactly as h3 yields them, with nothing normalised or coerced on the way: every conversion belongs in the schema, where the rest of the parsing rules live.

The body is read only on h3 v1's payload methods (`POST`, `PUT`, `PATCH`, `DELETE`); any other method validates `undefined`, so a method-agnostic route file that declares a body keeps serving `GET` instead of answering h3's bare `405`. The accepted cost: a `users.get.ts` that declares a body answers `400` rather than `500`. A body h3 cannot parse is one issue with the package's own message, never h3's, so an h3 patch is not a change to this package's wire.

## Why tuples, and why their keys must be disjoint

Composition is writing a tuple: each element validates the whole source, and their outputs merge into one value. That lets a route combine reusable schemas (pagination beside sorting beside a route-specific filter) without a schema library's own merge.

Two rules are checked at compile time, at the source key:

1. **Every element must produce an object.** Merging a primitive, an array or a function has no meaning. The test is structural, so an interface-typed output is not falsely refused.
2. **No two elements may produce the same key.** An intersection type would lie about which value survives the merge, so an overlap is refused; merge such schemas in the schema library instead.

What the types cannot see, such as a `z.custom` claiming an object it never produces, the runtime refuses with a developer fault rather than merging garbage. A lone schema is never merged, so its output, array or primitive included, passes through untouched.

## Why validation failures travel as a Known error

A rejected request is the Built-in validation-failed variant: `400`, `data: { _tag: 'validation-failed', issues }`, raised through the same construction as every declared failure. Every route with `input` carries it in its union, with no opt-out, so a call site handles rejected input with a typed arm like any other failure, and a route that only validates still gets a typed error union.

The first design sent the issues twice, at `data.issues` and inside the marker, so a caller whose marker was stripped still saw them. With one body for every caller, one copy is enough. `issues` sits at the key h3 v2 uses for its own validation failures. Each issue keeps a `source` beside its `message` and `path`, an addition over h3 v2, since fail-fast means one failure's issues share one source and a client rendering them wants to know which.

## Why `output` is an assertion

`output` declares what a route answers: one schema for a plain `200`, or a map from status to schema with `null` for a bodiless status, answered through `respond(status, value)`. The client is typed from the schemas' output types, as JSON carries them.

Production runs nothing on the response; a development server validates the handed-over value and discards the result. A schema that would strip or coerce on the way out therefore does neither, and the development server sends the bytes production sends. Declare a schema that describes the value, not one that repairs it. See [the error model](./errors.md#why-the-checks-are-development-only) for why every check is development-only.

The status rules exist because h3 v1 would otherwise answer something nobody declared: the bare form sets `200` itself, so a status set earlier cannot carry the `200` body; a `200` declared with no body is sent as an empty `200` rather than h3's `204`; and a map key outside `100` to `599` is refused, since h3 keeps the current status for a code it cannot send.
