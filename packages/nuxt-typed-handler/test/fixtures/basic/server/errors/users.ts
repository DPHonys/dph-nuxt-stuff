import { defineError, payload } from '../../../../../src/runtime/server'

// Imported by relative path: one module instance keeps the brand's private
// symbol comparable across the fixture's routes.
export const userErrors = defineError({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-exists': { status: 409, payload: payload<{ email: string }>() },
})
