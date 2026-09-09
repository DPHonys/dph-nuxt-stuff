import { draftIntent, draftRef } from '~~/server/validation/schemas'

/**
 * A status-map Response output: one handler answering under two declared
 * statuses through the Respond helper - `201` with a body, `204` with none.
 */
export default defineValidatedEventHandler(
  {
    input: { query: draftIntent },
    output: { 201: draftRef, 204: null },
  },
  (_event, { query, respond }) =>
    query.discard === 'yes' ? respond(204) : respond(201, { id: 'draft-1' })
)
