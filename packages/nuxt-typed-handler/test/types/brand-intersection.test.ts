import type {
  CheckedEventHandler,
  KnownErrorsOfHandler,
} from '@dphonys/nuxt-handler-errors/types'
import type {
  RequestInputOfHandler,
  ValidatedEventHandler,
} from '@dphonys/nuxt-handler-validation/types'
import type { EventHandlerRequest, EventHandlerResponse } from 'h3'
import { it } from 'vitest'
import { z } from 'zod'
import type { ValidationFailed } from '../../src/runtime/types'
import type { Assert, Equal } from './assert'

/**
 * Where the two parents meet: one typed handler carrying both phantom slots,
 * and each parent's extractor reading only the slot it owns. This is the
 * claim the generated map rests on - the emitter hands the *same* handler
 * type to `KnownErrorsOfHandler` and to `RequestInputOfHandler`, and the two
 * must answer different questions about it.
 *
 * Asserted by the compiler under `pnpm typecheck`. Every wrapper is declared
 * rather than imported: the runtime modules reach for the parents' internals,
 * which only resolve inside a build. `typeof import(…)` is a type query - it
 * asserts the real declaration and emits no import.
 */

declare const defineTypedEventHandler: typeof import('../../src/runtime/server/lib/typed-handler').defineTypedEventHandler
declare const defineCheckedEventHandler: typeof import('@dphonys/nuxt-handler-errors/server').defineCheckedEventHandler
declare const defineValidatedEventHandler: typeof import('@dphonys/nuxt-handler-validation/server').defineValidatedEventHandler
declare const defineError: typeof import('@dphonys/nuxt-handler-errors/server').defineError
declare const payload: typeof import('@dphonys/nuxt-handler-errors/server').payload

/** `[A] extends [B]`, so a union on the left is answered whole. */
type Extends<A, B> = [A] extends [B] ? true : false

/**
 * Each member's own properties, flattened. The errors parent composes a
 * declared variant as an intersection, and `Equal` - invariant on purpose -
 * reads an intersection and its flat twin as different types.
 */
type Flatten<T> = T extends unknown ? { [K in keyof T]: T[K] } : never

const createUser = z.object({ name: z.string() })
const pagination = z.object({ page: z.string().transform(Number) })

// Never called: `declare const` binds no value. The handler *types* are what
// this suite is about, and `ReturnType` is how they are named without one.

export function bothDeclared() {
  const userErrors = defineError({
    'user-exists': { status: 409, payload: payload<{ email: string }>() },
  })

  return defineTypedEventHandler(
    {
      validate: { body: createUser, query: pagination },
      errors: userErrors.pick('user-exists'),
    },
    (_event, { body, errors }) => {
      if (body.name === '') throw errors['user-exists']({ email: '' })
      return { ok: true }
    }
  )
}

export function validateOnly() {
  return defineTypedEventHandler(
    { validate: { query: pagination } },
    (_event, { query }) => ({ page: query.page })
  )
}

export function errorsOnly() {
  const userErrors = defineError({ 'user-not-found': { status: 404 } })

  return defineTypedEventHandler(
    { errors: userErrors.pick('user-not-found') },
    (_event, { errors }) => {
      throw errors['user-not-found']()
    }
  )
}

/** The errors parent's own wrapper: one slot, and only one. */
export function parentChecked() {
  const userErrors = defineError({ gone: { status: 410 } })

  return defineCheckedEventHandler(
    { errors: userErrors.pick('gone') },
    (_event, { errors }) => {
      throw errors.gone()
    }
  )
}

/** The validation parent's own wrapper: the other slot, and only that one. */
export function parentValidated() {
  return defineValidatedEventHandler(
    { validate: { body: createUser } },
    (_event, { body }) => ({ name: body.name })
  )
}

type BothHandler = ReturnType<typeof bothDeclared>
type ValidateOnlyHandler = ReturnType<typeof validateOnly>
type ErrorsOnlyHandler = ReturnType<typeof errorsOnly>
type ParentCheckedHandler = ReturnType<typeof parentChecked>
type ParentValidatedHandler = ReturnType<typeof parentValidated>

/** What a route that declared no source computes as its Request input. */
interface EmptyInput {}

/** The declared failure, as the errors parent computes it from the tuple. */
interface UserExists {
  tag: 'user-exists'
  status: 409
  email: string
}

// --- one handler, both brands ----------------------------------------------

type _isCheckedHandler = Assert<
  Extends<
    BothHandler,
    CheckedEventHandler<
      EventHandlerRequest,
      EventHandlerResponse,
      UserExists | ValidationFailed
    >
  >
>

type _isValidatedHandler = Assert<
  Extends<
    BothHandler,
    ValidatedEventHandler<
      EventHandlerRequest,
      EventHandlerResponse,
      { body: { name: string }; query: { page: string } }
    >
  >
>

// --- each extractor reads its own slot, and nothing else --------------------

type _errorsSlot = Assert<
  Equal<
    Flatten<KnownErrorsOfHandler<BothHandler>>,
    Flatten<UserExists | ValidationFailed>
  >
>

type _inputSlot = Assert<
  Equal<
    RequestInputOfHandler<BothHandler>,
    { body: { name: string }; query: { page: string } }
  >
>

// The failure this catches is one parent's extractor keying on the other's
// slot: it would answer here, where it must not.
type _checkedCarriesNoInput = Assert<
  Equal<RequestInputOfHandler<ParentCheckedHandler>, never>
>

type _validatedCarriesNoErrors = Assert<
  Equal<KnownErrorsOfHandler<ParentValidatedHandler>, never>
>

// --- one negative per slot -------------------------------------------------

/** A `validate`-only route can only fail the one way, and says so. */
type _validateOnlyErrors = Assert<
  Equal<KnownErrorsOfHandler<ValidateOnlyHandler>, ValidationFailed>
>

/**
 * An `errors`-only route declares no source, so its input is the empty
 * record - not `never`, which is what a handler this parent never branded
 * answers (`_checkedCarriesNoInput` above). The emitted map settles which:
 * `emitted-map.test.ts` renders this slot as `{}`. Spec 03 section 8.3 says
 * `never` for this row; the built code says `{}`, and the assertion follows
 * the code.
 */
type _errorsOnlyInput = Assert<
  Equal<RequestInputOfHandler<ErrorsOnlyHandler>, EmptyInput>
>

it('is asserted by the compiler', () => {})
