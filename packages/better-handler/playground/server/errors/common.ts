import { z } from 'zod'

/**
 * Declarations every order route shares, reused by spread. `defineError`
 * arrives by auto-import, like the rest of the server surface.
 */
export const commonErrors = {
  ...defineError('unauthorized', { status: 401 }),
  ...defineError('forbidden', {
    status: 403,
    schema: z.object({ requiredRole: z.enum(['admin', 'owner']) }),
  }),
}
