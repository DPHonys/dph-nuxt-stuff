# Nuxt Handler Validation

**Status: parked.** This package is `private: true`, is not published, and owes
no release. It exists so the validation feature that was cut from
[`@dphonys/nuxt-handler-errors`](../nuxt-handler-errors) before its first
release keeps compiling and testing against the current core — drift is a red
build here, not a rotting branch. Admitting it later is a deliberate decision,
not a default.

## What it is

Typed input validation for Nitro handlers, **layered on** the core package
rather than built into it. Any [Standard Schema](https://standardschema.dev)
validator (zod, valibot, arktype) rides the same options object, every declared
location is validated before the handler body runs, and a malformed request is
answered with the `invalid-input` declared failure — one response reporting
everything wrong at once, with issue paths as lossless segment arrays.

```ts
import {
  defineValidatedEventHandler,
  invalidInput,
} from '@dphonys/nuxt-handler-validation'
import { z } from 'zod'

const CreateUser = z.object({ name: z.string().min(1), email: z.email() })

export default defineValidatedEventHandler(
  { errors: [invalidInput], body: CreateUser },
  async (_event, { fail, body }) => {
    // `body` is CreateUser's output, already parsed. `fail` is core's own.
    return db.users.create(body)
  }
)
```

`defineValidatedEventHandler` mirrors core's `defineTypedEventHandler` exactly,
plus `body`/`query`/`params`. A route that declares no schema is handed to core
untouched.

## How it layers

Core knows nothing about this package. The definer wraps core's, runs the
adapter (`validateDeclaredInput`) before the wrapped handler, and raises a
failure **through the route's own `fail`** — which is what keeps the
`invalid-input` status swappable (declare your own catalogue with the same tag
at 422 and list it) and the opt-out free (declare a schema, don't list a
catalogue: still a 400, unmarked). A declared raise is told apart from core's
unknown-tag `Error` by the wire contract itself — marker presence — not by any
private core API.

## What is tested here, and what is not

Ported from core when the feature was parked:

- **The adapter over hostile input** (`test/validate.test.ts`): junk issue
  paths, symbol keys, prototype-polluting keys, unreadable sources, async
  schemas, empty issue lists.
- **The definer over real h3 events** (`test/define.test.ts`): parsed inputs
  delivered flat, marked vs unmarked raise, swappable status, the masked-405
  trade, the no-schema passthrough.
- **The affordable type-level subset** (`test/types.ts`, checked by
  `tsc --noEmit`): parsed input types, the declared union, the swappable
  status, and the four things that must not compile (`safeParse`, a plain
  function, an undeclared location, an unfillable payload).

**Known gaps**, stated rather than hidden — all three existed as tests in core
and were not ported because they need core's compile-time harness or a built
playground:

- No wire test: nothing here proves the failure crosses a real network.
- No diagnostic-message assertions: the guard-first "names the offending
  field" mandate is unverified (the _rejection_ still is verified).
- No hover budgets: the `ValidationIssue` named-interface rendering mandate is
  unverified.

## Design decisions carried over

The design record for all of this is core's `SPEC.md` §3.3 and §11.4. The
short list: eager flat inputs (no lazy accessors), one merged variant rather
than one per location, segment-array paths, no `headers` location, no
plain-function escape hatch, an unreadable source is an issue not a throw
(masking h3's 405, deliberately), and validation runs **before** the handler
body — so auth belongs in Nitro middleware, not in the handler.
