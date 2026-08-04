import {
  defineTypedEventHandler,
  invalidInput,
} from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'
import { z } from 'zod'
import { authErrors } from '#shared/errors/auth'
// The same reach into the module package's own suite the other route files
// make: `Equal` and `Expect` are fixed vocabulary (SPEC.md §9.5) and a second
// copy here could drift from the one every other assertion uses.
import type { Equal, Expect } from '../../../test/types/vocabulary'

/**
 * The validation route (SPEC.md §3.3), and the only place in this repo where a
 * **real** Standard Schema library meets a **real** server.
 *
 * zod is a dependency of the playground and of nothing else: the module inlines
 * the spec's ~50 lines and depends on no validator, so *"any conforming
 * validator works untouched"* is a claim that has to be run rather than
 * asserted. `test/types/schemas.ts` makes the same declaration surface's
 * type-level claims with no validator in the program at all.
 *
 * The dotted key is deliberate. `contact.email` is what makes SPEC.md §11.4's
 * argument against a dotted-string `path` observable end to end: the issue this
 * route produces for it crosses the wire as `["contact.email"]`, and a client
 * that wants the dotted form does one `.join('.')` and gets the key back
 * exactly. A `path` of `"contact.email"` could not be told apart from a nested
 * `contact` object.
 */
const CreateUser = z.object({
  name: z.string().min(1),
  'contact.email': z.email(),
  tags: z.array(z.object({ label: z.string() })).optional(),
})

/** `z.coerce` is the half of "already parsed" h3 v2 cannot represent at all. */
const Invite = z.object({ code: z.coerce.number() })

export default defineTypedEventHandler(
  {
    errors: [invalidInput, authErrors.pick('unauthorized')],
    body: CreateUser,
    query: Invite,
  },
  async (_event, { fail, body, query }) => {
    // SPEC.md §3.3's documented ordering consequence, in one route: this check
    // runs *after* validation, so a malformed request from a caller with a bad
    // invite code is answered with field names before it is answered with 401.
    // The answer is auth in Nitro middleware, which runs before the handler.
    if (query.code === 0) return fail('unauthorized')

    return {
      name: body.name,
      email: body['contact.email'],
      tagCount: body.tags?.length ?? 0,
      code: query.code,
    }
  }
)

// ---------------------------------------------------------------------------
// Layer 3 (SPEC.md §9.1)
//
// Against the **actually generated** map, which is the only place the shipped
// variant is seen after Nitro's own `Simplify<Serialize<…>>` has run over it.
// `test/types/pos/validation.ts` runs the same chain by hand; this runs the one
// a consumer's editor will.
// ---------------------------------------------------------------------------

/** The generated map's entry for this route, at its real key. */
type SignupFailure = TypedApiErrors['/api/signup']['post']

type ValidationFailure = Extract<SignupFailure, { tag: 'invalid-input' }>

/**
 * **The declared union is what `errors: [...]` listed**, and the shipped
 * catalogue composes with an app's own exactly like any other.
 */
type _signupTags = Expect<
  Equal<SignupFailure['tag'], 'invalid-input' | 'unauthorized'>
>

type _signupStatus = Expect<Equal<ValidationFailure['status'], 400>>

/**
 * **The issue array survives the real pipeline as an array of objects.**
 * `Serialize` maps a non-JSON primitive element to `null`, so an issue type
 * that had picked up a symbol or a function anywhere — which is precisely what
 * re-exporting Standard Schema's own `Issue` would have done, since its `path`
 * admits `symbol` — would arrive here as `null[]` with no other signal.
 */
type WireIssue = ValidationFailure['issues'][number]

type _issueLocation = Expect<
  Equal<WireIssue['location'], 'body' | 'query' | 'params'>
>
type _issuePath = Expect<Equal<WireIssue['path'], (string | number)[]>>
type _issueMessage = Expect<Equal<WireIssue['message'], string>>
