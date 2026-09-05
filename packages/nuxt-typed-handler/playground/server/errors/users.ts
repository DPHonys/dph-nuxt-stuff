/** The failures the user routes declare, shared so both spell them once. */
export const userErrors = defineError({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-exists': { status: 409, payload: payload<{ email: string }>() },
})
