/**
 * The validation surface, asserted where it is decided (SPEC.md §3.3).
 *
 * Must compile with **zero** diagnostics (SPEC.md §9.5 rule 3). Everything
 * structural about schemas on the options object, the parsed input on the
 * handler context, and the shipped `invalidInput` catalogue is claimed here;
 * the things that must *not* compile are claimed one file at a time in
 * `../neg/`.
 *
 * Variant shapes are asserted through `Simplify<Serialize<…>>` — Nitro's own
 * chain — because that is what the generated map runs them through, and for
 * `issues` it is the only spelling that proves the array survives the wire as
 * an array of objects rather than as `null[]`.
 */

import type { Serialize, Simplify } from 'nitropack/types'
import {
  defineErrors,
  defineTypedEventHandler,
  invalidInput,
  payload,
} from '../../../src/runtime/shared'
import type {
  AnyVariant,
  ErrorCatalogue,
  ValidationIssue,
} from '../../../src/runtime/types'
import { schemaOf } from '../schemas'
import type { Equal, Expect, IsAny, IsNever } from '../vocabulary'

/** Reads a catalogue value's declared union back out of its type. */
type VariantsIn<C> = C extends ErrorCatalogue<infer E> ? E : never

/** The shape the wire and the generated map will actually carry. */
type OnTheWire<E extends AnyVariant, T extends E['tag']> = Simplify<
  Serialize<Extract<E, { tag: T }>>
>

const authErrors = defineErrors({
  unauthorized: { status: 401 },
})

const CreateUser = schemaOf<{ name: string; email: string }>()
const Paging = schemaOf<{ page: number }>()
const Params = schemaOf<{ id: string }>()

// ---------------------------------------------------------------------------
// The shipped catalogue is an ordinary catalogue
// ---------------------------------------------------------------------------

type InvalidInput = VariantsIn<typeof invalidInput>

/**
 * Tag and status are exactly what SPEC.md §3.3 fixes them at, and `issues` is
 * the module's own array — these are the assertions that stop the tag literal
 * in `/types` and the one the catalogue is keyed by from drifting apart.
 */
type _invalidInputTag = Expect<Equal<InvalidInput['tag'], 'invalid-input'>>
type _invalidInputStatus = Expect<Equal<InvalidInput['status'], 400>>
type _invalidInputIssues = Expect<
  Equal<InvalidInput['issues'], ValidationIssue[]>
>

type _invalidInputNotCollapsed = Expect<Equal<IsAny<InvalidInput>, false>>

/** It composes, and `.pick()` works on it — vacuously, but it is there. */
const _pickedInvalidInput = invalidInput.pick('invalid-input')

type _pickKeepsTheOnlyTag = Expect<
  Equal<VariantsIn<typeof _pickedInvalidInput>['tag'], 'invalid-input'>
>

// ---------------------------------------------------------------------------
// What arrives on the wire (SPEC.md §3.3, §8.3(c))
// ---------------------------------------------------------------------------

type Wire = OnTheWire<InvalidInput, 'invalid-input'>

/**
 * `infer` rather than `[number]`: the fixture config sets
 * `noUncheckedIndexedAccess`, which would otherwise put a `| undefined` on
 * every element read and make each assertion below about the wrong type.
 */
type WireIssue = Wire['issues'] extends readonly (infer I)[] ? I : never

type _wireTag = Expect<Equal<Wire['tag'], 'invalid-input'>>
type _wireStatus = Expect<Equal<Wire['status'], 400>>

/**
 * **The array survives as an array of objects.** `Serialize` maps a
 * `NonJsonPrimitive` element to `null`, so an issue type that had picked up a
 * function or a symbol anywhere would arrive as `null[]` with no other signal.
 */
type _wireIssuesAreObjects = Expect<
  Equal<IsNever<Extract<WireIssue, null>>, true>
>

/**
 * The three fields, each asserted through `Serialize` rather than on paper.
 * `path` is the one that matters: SPEC.md §11.4 records that the spec's own
 * `Issue.path` comes out of `Serialize` as
 * `(string | number | { readonly key: string | number } | null)[]`, which is
 * exactly what normalisation exists to avoid, so this line is what proves the
 * normalisation happened.
 */
type _wireIssueLocation = Expect<
  Equal<WireIssue['location'], 'body' | 'query' | 'params'>
>
type _wireIssuePath = Expect<Equal<WireIssue['path'], (string | number)[]>>
type _wireIssueMessage = Expect<Equal<WireIssue['message'], string>>

// ---------------------------------------------------------------------------
// Schemas ride the same options object, and the parsed input arrives typed
// ---------------------------------------------------------------------------

const _handler = defineTypedEventHandler(
  {
    errors: [invalidInput, authErrors],
    body: CreateUser,
    query: Paging,
    params: Params,
  },
  async (event, { fail, body, query, params }) => {
    if (params.id === 'nobody') return fail('unauthorized')

    return {
      path: event.path,
      name: body.name,
      email: body.email,
      page: query.page,
      id: params.id,
    }
  }
)

/** Each declared location arrives as its schema's **output**, already parsed. */
const _typedInputs = defineTypedEventHandler(
  { errors: [invalidInput], body: CreateUser, query: Paging },
  async (_event, { body, query }) => {
    const _bodyIsParsed: Expect<
      Equal<typeof body, { name: string; email: string }>
    > = true
    const _queryIsParsed: Expect<Equal<typeof query, { page: number }>> = true

    // Read as values as well as types, which is what the module promises: the
    // parsed input is on the context eagerly, not behind an accessor.
    return {
      ok: _bodyIsParsed && _queryIsParsed,
      name: body.name,
      page: query.page,
    }
  }
)

/**
 * **The success type still infers with no annotation** (SPEC.md §3.1). This is
 * the property validation could most easily have broken: the definer's
 * validating branch is `async`, and if that leaked into the declared return
 * type every branded route in an app would serialize as a promise.
 */
type _successStillInfers = Expect<
  Equal<
    Simplify<Serialize<Awaited<ReturnType<typeof _handler>>>>,
    {
      path: string
      name: string
      email: string
      page: number
      id: string
    }
  >
>

/** The declared union is exactly what `errors: [...]` listed — no more. */
type Declared = NonNullable<(typeof _handler)['__declaredErrors__']>

type _declaredUnion = Expect<
  Equal<Declared['tag'], 'invalid-input' | 'unauthorized'>
>

/**
 * **`headers` is not a location, and the rejection is a compile error rather
 * than a silent no-op** (SPEC.md §3.3, §11.4).
 *
 * h3 offers no analogue, header contracts are a middleware or gateway concern,
 * and every header value is a string. It is recorded as an *explicit* rejection
 * because `ValidationLocation` is closed and published inside a payload: adding
 * a fourth member later widens a wire type every consumer has already narrowed
 * on. The `@ts-expect-error` is the assertion — if the excess property ever
 * started compiling, this fixture stops compiling clean, which is SPEC.md §9.5
 * rule 3's own signal.
 */
const _noHeaderLocation = defineTypedEventHandler(
  {
    errors: [invalidInput],
    body: CreateUser,
    // @ts-expect-error `headers` is not a declarable location.
    headers: CreateUser,
  },
  async (_event, { body }) => ({ name: body.name })
)

// ---------------------------------------------------------------------------
// Opting out is free, and needs no machinery (SPEC.md §3.3)
// ---------------------------------------------------------------------------

/**
 * A schema declared, the catalogue **not** listed. This compiles — validation
 * still runs and still fails, unmarked — and the published union matches the
 * declaration exactly, which is the whole of the opt-out design.
 *
 * The stated cost is visible right here: nothing about this declaration says
 * the author meant to have the typed variant.
 */
const _optedOut = defineTypedEventHandler(
  { errors: [authErrors], body: CreateUser },
  async (_event, { body }) => ({ name: body.name })
)

type _optedOutUnion = Expect<
  Equal<
    NonNullable<(typeof _optedOut)['__declaredErrors__']>['tag'],
    'unauthorized'
  >
>

// ---------------------------------------------------------------------------
// The status is swappable (SPEC.md §3.3)
// ---------------------------------------------------------------------------

/**
 * An app standardising on 422 declares its own catalogue with the same tag and
 * lists that instead. The shape guard is satisfied because the module can still
 * fill the payload; the status is the app's.
 */
const appValidation = defineErrors({
  'invalid-input': {
    status: 422,
    payload: payload<{ issues: ValidationIssue[] }>(),
  },
})

const _swapped = defineTypedEventHandler(
  { errors: [appValidation], body: CreateUser },
  async (_event, { body }) => ({ name: body.name })
)

type _swappedStatus = Expect<
  Equal<
    Extract<
      NonNullable<(typeof _swapped)['__declaredErrors__']>,
      { tag: 'invalid-input' }
    >['status'],
    422
  >
>

/**
 * A variant tagged `invalid-input` that declares *no* payload is fillable too —
 * the module simply supplies more than the client was told about, which is a
 * subset, not a lie. Only a field the module has no value for is an error, and
 * that is `../neg/validation-unfillable-payload.ts`.
 */
const _bareValidation = defineErrors({ 'invalid-input': { status: 400 } })

const _bare = defineTypedEventHandler(
  { errors: [_bareValidation], query: Paging },
  async (_event, { query }) => ({ page: query.page })
)

type _bareCompiles = Expect<
  Equal<
    NonNullable<(typeof _bare)['__declaredErrors__']>['tag'],
    'invalid-input'
  >
>

// ---------------------------------------------------------------------------
// Hover legibility (SPEC.md §8.3(c))
// ---------------------------------------------------------------------------

/**
 * **The named-interface mandate for an array-valued payload field.** Nitro's
 * `Simplify` short-circuits on arrays, so this field never expands and what a
 * caller reads is whatever the element type is *called*. Budgeted in
 * `../validation.test.ts`, against the inline spelling below.
 */
declare const _hoverIssues: Wire['issues']

/** The same field with the element type written inline — the mutation. */
const _inlineIssues = defineErrors({
  'invalid-input': {
    status: 400,
    payload: payload<{
      issues: {
        location: 'body' | 'query' | 'params'
        path: (string | number)[]
        message: string
      }[]
    }>(),
  },
})

declare const _hoverInlineIssues: OnTheWire<
  VariantsIn<typeof _inlineIssues>,
  'invalid-input'
>['issues']
