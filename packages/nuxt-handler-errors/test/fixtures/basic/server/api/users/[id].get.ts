import {
  defineCheckedEventHandler,
  defineError,
  payload,
} from '../../../../../../src/runtime/server'

/**
 * A checked route, so the fixture's generated map has a branded entry to key.
 * The definition surface is imported by relative path rather than through the
 * published specifier: the fixture loads the module from `src/` too, and one
 * module instance is what keeps the brand's private symbol comparable.
 */
const userErrors = defineError({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})

export default defineCheckedEventHandler(
  { errors: [...userErrors] },
  (event, { fail }) => {
    const id = event.context.params?.id ?? ''

    if (id === '') return fail('user-not-found', { userId: id })

    return { id, name: 'Ada' }
  }
)
