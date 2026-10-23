import { draftCreated, draftIntent, draftRef } from '../validation/schemas'

/**
 * A status-map Response output: one handler answering under three declared
 * statuses through the Respond helper, `204` carrying no body at all.
 */
export default defineTypedEventHandler(
  {
    input: { query: draftIntent },
    output: { 200: draftRef, 201: draftCreated, 204: null },
  },
  (_event, { query, respond }) => {
    if (query.answer === 'discarded') return respond(204)
    if (query.answer === 'created') {
      return respond(201, { id: 'draft-1', createdAt: '2026-09-09' })
    }

    return respond(200, { id: 'draft-1' })
  }
)
