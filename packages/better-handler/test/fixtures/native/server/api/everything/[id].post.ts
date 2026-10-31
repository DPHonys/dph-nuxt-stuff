import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../../schema'

// Every source, a status-map output and errors.
export default defineBetterEventHandler(
  {
    input: {
      route: schema<{ id: string }>(),
      query: schema<{ dryRun?: 'yes' | 'no' }>(),
      headers: schema<{ 'x-tenant': string }>(),
      body: schema<{
        title: string
        tags: string[]
        meta: { draft: boolean }
      }>(),
    },
    output: { 200: schema<{ id: string; title: string }>(), 204: null },
    errors: {
      'doc-locked': { status: 409, schema: schema<{ by: string }>() },
      'doc-gone': { status: 410 },
    },
  },
  (_event, { route, body, respond, fail }) => {
    if (body.meta.draft) throw fail('doc-locked', { by: 'x' })
    return respond(200, { id: route.id, title: body.title })
  }
)
